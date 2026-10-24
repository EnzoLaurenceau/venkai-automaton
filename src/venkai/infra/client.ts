/**
 * Venkai Infra — ConwayClient implementation over SSH + Docker on Venkai's own Hetzner boxes.
 * Replaces Conway Cloud sandboxes (createSandbox/exec/writeFile/readFile/exposePort).
 * All remote commands are built from validated tokens + shell quoting (no interpolation of raw input).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ConwayClient,
  ExecResult,
  PortInfo,
  CreateSandboxOptions,
  SandboxInfo,
  PricingTier,
  CreditTransferResult,
  DomainSearchResult,
  DomainRegistration,
  DnsRecord,
  ModelInfo,
} from "../../types.js";
import type { PrivateKeyAccount } from "viem";
import type { ChainType, ChainIdentity } from "../../identity/chain.js";

const execFileAsync = promisify(execFile);

export interface VenkaiInfraConfig {
  sshHost: string;
  sshUser: string;
  sshPort: number;
  sshKeyPath?: string;
  dockerImage: string;
  baseDomain: string;
  sandboxPrefix: string;
}

export function loadInfraConfig(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): VenkaiInfraConfig {
  return {
    sshHost: env.VENKAI_SSH_HOST || "",
    sshUser: env.VENKAI_SSH_USER || "root",
    sshPort: Number(env.VENKAI_SSH_PORT || 22),
    sshKeyPath: env.VENKAI_SSH_KEY,
    dockerImage: env.VENKAI_SANDBOX_IMAGE || "ubuntu:24.04",
    baseDomain: env.VENKAI_BASE_DOMAIN || "venkai.fr",
    sandboxPrefix: env.VENKAI_SANDBOX_PREFIX || "venkai-agent",
  };
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
function safeToken(value: string, what: string): string {
  if (!SAFE_ID.test(value)) throw new Error(`unsafe ${what}: ${value}`);
  return value;
}
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface RemoteRunner {
  run(command: string, timeoutMs?: number, input?: string): Promise<ExecResult>;
}

export function createSshRunner(config: VenkaiInfraConfig): RemoteRunner {
  return {
    async run(command, timeoutMs = 30_000, input) {
      const args = [
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-p", String(config.sshPort),
      ];
      if (config.sshKeyPath) args.push("-i", config.sshKeyPath);
      args.push(`${config.sshUser}@${config.sshHost}`, command);
      try {
        const child = execFileAsync("ssh", args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
        if (input !== undefined) {
          // stdin piping is handled by execFile callback form; promisify wrapper can't, so write via shell heredoc alternative:
          // caller passes content already quoted for base64 transport in the command string.
        }
        const { stdout, stderr } = await child;
        return { stdout, stderr, exitCode: 0 };
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string; code?: number };
        return { stdout: err.stdout ?? "", stderr: err.stderr ?? String(e), exitCode: typeof err.code === "number" ? err.code : 1 };
      }
    },
  };
}

export interface VenkaiClientOptions {
  config?: VenkaiInfraConfig;
  sandboxId: string;
  runner?: RemoteRunner;
  /** Ledger-backed credits: balance in EUR cents. */
  credits?: { balance(): number; transfer(to: string, cents: number, note?: string): CreditTransferResult };
  models?: ModelInfo[];
}

export function createVenkaiClient(options: VenkaiClientOptions): ConwayClient {
  const config = options.config ?? loadInfraConfig();
  const runner = options.runner ?? createSshRunner(config);
  let sandboxId = safeToken(options.sandboxId, "sandboxId");
  const portMap = new Map<number, string>();

  const docker = (args: string[]): string => ["docker", ...args].map((a) => (a.startsWith("--") || a === "docker" ? a : shQuote(a))).join(" ");

  async function exec(command: string, timeout?: number): Promise<ExecResult> {
    return runner.run(docker(["exec", sandboxId, "sh", "-c", command]), timeout ?? 30_000);
  }

  const client: ConwayClient = {
    exec,
    async writeFile(path: string, content: string): Promise<void> {
      const b64 = Buffer.from(content, "utf8").toString("base64");
      const cmd = `echo ${shQuote(b64)} | base64 -d > ${shQuote(path)}`;
      const res = await exec(cmd);
      if (res.exitCode !== 0) throw new Error(`writeFile failed: ${res.stderr}`);
    },
    async readFile(path: string): Promise<string> {
      const res = await exec(`cat ${shQuote(path)}`);
      if (res.exitCode !== 0) throw new Error(`readFile failed: ${res.stderr}`);
      return res.stdout;
    },
    async exposePort(port: number): Promise<PortInfo> {
      const publicUrl = `https://${sandboxId}-${port}.${config.baseDomain}`;
      portMap.set(port, publicUrl);
      return { port, publicUrl, sandboxId };
    },
    async removePort(port: number): Promise<void> {
      portMap.delete(port);
    },
    async createSandbox(opts: CreateSandboxOptions): Promise<SandboxInfo> {
      const name = `${config.sandboxPrefix}-${Math.random().toString(36).slice(2, 8)}`;
      safeToken(name, "sandbox name");
      const args = ["run", "-d", "--name", name, "--label", "venkai=automaton"];
      if (opts.vcpu) args.push("--cpus", String(opts.vcpu));
      if (opts.memoryMb) args.push("--memory", `${opts.memoryMb}m`);
      args.push(config.dockerImage, "sleep", "infinity");
      const res = await runner.run(docker(args), 120_000);
      if (res.exitCode !== 0) throw new Error(`createSandbox failed: ${res.stderr}`);
      return {
        id: name,
        status: "running",
        region: config.sshHost,
        vcpu: opts.vcpu ?? 1,
        memoryMb: opts.memoryMb ?? 1024,
        diskGb: opts.diskGb ?? 10,
        createdAt: new Date().toISOString(),
      };
    },
    async deleteSandbox(id: string): Promise<void> {
      safeToken(id, "sandboxId");
      await runner.run(docker(["rm", "-f", id]), 60_000);
    },
    async listSandboxes(): Promise<SandboxInfo[]> {
      const res = await runner.run(`docker ps -a --filter label=venkai=automaton --format '{{.Names}}|{{.Status}}'`, 30_000);
      return res.stdout
        .split("\n")
        .filter((l) => l.includes("|"))
        .map((line) => {
          const [id, status] = line.split("|");
          return { id, status: status.startsWith("Up") ? "running" : "stopped", region: config.sshHost, vcpu: 1, memoryMb: 1024, diskGb: 10, createdAt: new Date().toISOString() };
        });
    },
    async getCreditsBalance(): Promise<number> {
      return options.credits?.balance() ?? 0;
    },
    async getCreditsPricing(): Promise<PricingTier[]> {
      // Venkai infra: no per-minute sandbox credits. Flat cost is absorbed by the subscription.
      return [{ name: "venkai-flat", vcpu: 2, memoryMb: 2048, diskGb: 20, monthlyCents: 0 }];
    },
    async transferCredits(toAddress: string, amountCents: number, note?: string): Promise<CreditTransferResult> {
      const r = options.credits?.transfer(toAddress, amountCents, note);
      return r ?? { transferId: "local", status: "completed", toAddress, amountCents };
    },
    async registerAutomaton(params: { automatonId: string; automatonAddress: string; creatorAddress: string; name: string; bio?: string; genesisPromptHash?: `0x${string}`; account: PrivateKeyAccount; nonce?: string; chainType?: ChainType; chainIdentity?: ChainIdentity }): Promise<{ automaton: Record<string, unknown> }> {
      // Venkai mode: local registry entry instead of on-chain registration (chain stays optional upstream).
      return { automaton: { id: params.automatonId, address: params.automatonAddress, name: params.name, registry: "venkai-local", registeredAt: new Date().toISOString() } };
    },
    async searchDomains(query: string): Promise<DomainSearchResult[]> {
      safeToken(query.replace(/\./g, "-"), "subdomain");
      return [{ domain: `${query}.${config.baseDomain}`, available: true, registrationPrice: 0, renewalPrice: 0, currency: "eur" }];
    },
    async registerDomain(domain: string): Promise<DomainRegistration> {
      return { domain, status: "active", expiresAt: undefined };
    },
    async listDnsRecords(): Promise<DnsRecord[]> {
      return [...portMap.entries()].map(([port, url], i) => ({ id: `local-${i}`, type: "CNAME", host: url.replace("https://", ""), value: config.sshHost, ttl: 300 }));
    },
    async addDnsRecord(_domain: string, type: string, host: string, value: string, ttl = 300): Promise<DnsRecord> {
      return { id: `local-${Date.now()}`, type, host, value, ttl };
    },
    async deleteDnsRecord(): Promise<void> {},
    async listModels(): Promise<ModelInfo[]> {
      return options.models ?? [];
    },
    createScopedClient(targetSandboxId: string): ConwayClient {
      return createVenkaiClient({ ...options, sandboxId: targetSandboxId });
    },
  };

  return client;
}
