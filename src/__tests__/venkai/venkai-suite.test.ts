import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { createLedger, formatEur } from "../../venkai/billing/ledger.js";
import { verifyWebhookSignature, offerFromEvent, ENTITLEMENTS, type StripeEvent } from "../../venkai/billing/stripe-billing.js";
import { createWebhookHandler } from "../../venkai/billing/webhook-server.js";
import { createProvisioner } from "../../venkai/billing/provisioner.js";
import { createVenkaiCreditsAdapter, agentAccount, COST_SCHEDULE } from "../../venkai/billing/credits-adapter.js";
import { createVenkaiClient, loadInfraConfig } from "../../venkai/infra/client.js";
import { loadMcpBridgeTools, createMcpClient } from "../../venkai/tools/mcp-bridge.js";
import { createInlinePool, createWorkerPool } from "../../venkai/orchestration/worker-pool.js";
import { importHermesSkills } from "../../venkai/skills/bridge.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function memDb(): Database.Database {
  return new Database(":memory:");
}

describe("venkai ledger", () => {
  it("credits, debits, transfers and balances", () => {
    const ledger = createLedger(memDb());
    ledger.credit("a", 10000, "r1");
    expect(ledger.balanceCents("a")).toBe(10000);
    ledger.debit("a", 2500);
    expect(ledger.balanceCents("a")).toBe(7500);
    ledger.transfer("a", "b", 1500, "split");
    expect(ledger.balanceCents("a")).toBe(6000);
    expect(ledger.balanceCents("b")).toBe(1500);
    expect(formatEur(6000)).toBe("60.00 EUR");
  });

  it("rejects overdraft and non-integer amounts", () => {
    const ledger = createLedger(memDb());
    expect(() => ledger.debit("a", 1)).toThrow();
    expect(() => ledger.credit("a", 10.5)).toThrow();
  });

  it("applyOnce is idempotent per reference", () => {
    const ledger = createLedger(memDb());
    expect(ledger.applyOnce("stripe:evt1", "c", 5000, "credit")).not.toBeNull();
    expect(ledger.applyOnce("stripe:evt1", "c", 5000, "credit")).toBeNull();
    expect(ledger.balanceCents("c")).toBe(5000);
  });
});

describe("stripe webhook signature", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt1", type: "checkout.session.completed" });
  const sign = (t: number, p = payload, s = secret) => `t=${t},v1=${crypto.createHmac("sha256", s).update(`${t}.${p}`).digest("hex")}`;

  it("accepts a valid signature", () => {
    const now = 1_700_000_000_000;
    expect(verifyWebhookSignature(payload, sign(Math.floor(now / 1000)), secret, 300, now)).toBe(true);
  });

  it("rejects tampered payload, wrong secret and stale timestamps", () => {
    const now = 1_700_000_000_000;
    const t = Math.floor(now / 1000);
    expect(verifyWebhookSignature(payload + "x", sign(t), secret, 300, now)).toBe(false);
    expect(verifyWebhookSignature(payload, sign(t, payload, "wrong"), secret, 300, now)).toBe(false);
    expect(verifyWebhookSignature(payload, sign(t - 3600), secret, 300, now)).toBe(false);
    expect(verifyWebhookSignature(payload, "garbage", secret, 300, now)).toBe(false);
  });

  it("maps events to offers", () => {
    const ev: StripeEvent = { id: "e", type: "checkout.session.completed", data: { object: { metadata: { offer: "automaton-pro" } } } };
    expect(offerFromEvent(ev)).toBe("automaton-pro");
    expect(ENTITLEMENTS["automaton-trading"].kind).toBe("subscription");
  });
});

describe("webhook handler", () => {
  it("provisions once, dedups retries, rejects bad signatures", async () => {
    const db = memDb();
    const ledger = createLedger(db);
    let provisioned = 0;
    const secret = "whsec_test";
    const event = {
      id: "evt_123",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", amount_total: 9400, metadata: { offer: "automaton-pro" }, customer_details: { email: "client@example.com" } } },
    };
    const payload = JSON.stringify(event);
    const t = Math.floor(Date.now() / 1000);
    const sig = `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;

    const handler = createWebhookHandler({
      secret,
      ledger,
      provisioner: { provision: async () => { provisioned++; return { subdomain: "x", emailSent: true, slackNotified: true }; } } as never,
      db,
    });

    expect(handler(payload, sig).status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(provisioned).toBe(1);
    expect(ledger.balanceCents("agent:treasury")).toBe(9400);
    // Stripe retry: dedup, no double provision
    expect(handler(payload, sig).body).toBe("already processed");
    await new Promise((r) => setTimeout(r, 10));
    expect(provisioned).toBe(1);
    // bad signature
    expect(handler(payload, "t=1,v1=bad").status).toBe(400);
  });
});

describe("provisioner", () => {
  it("creates server, dns, email and slack via fetch", async () => {
    const calls: string[] = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      return new Response(JSON.stringify({ server: { id: 42, public_net: { ipv4: { ip: "1.2.3.4" } } } }), { status: 200 });
    };
    const provisioner = createProvisioner(
      { hetznerApiKey: "h", cloudflareApiToken: "c", cloudflareZoneId: "z", resendApiKey: "r", slackWebhookUrl: "https://hooks.slack.test/x", baseDomain: "venkai.fr" },
      fakeFetch as never,
    );
    const result = await provisioner.provision({ email: "Client@Example.com", offer: "automaton-pro" });
    expect(result.serverId).toBe("42");
    expect(result.subdomain).toMatch(/^client-[a-z0-9]{4}$/);
    expect(calls.some((c) => c.includes("hetzner.cloud"))).toBe(true);
    expect(calls.some((c) => c.includes("cloudflare.com"))).toBe(true);
    expect(calls.some((c) => c.includes("resend.com"))).toBe(true);
    expect(calls.some((c) => c.includes("hooks.slack.test"))).toBe(true);
  });
});

describe("credits adapter (zero bootstrap self-financing)", () => {
  it("starts at zero, earns, pays its own costs", () => {
    const tmp = path.join(os.tmpdir(), `venkai-${Date.now()}.db`);
    const adapter = createVenkaiCreditsAdapter(tmp, "agent-1");
    expect(adapter.account).toBe(agentAccount("agent-1"));
    expect(adapter.balance()).toBe(0); // nobody funds the agent
    adapter.earn(9400, "stripe:evt1", "checkout automaton-pro");
    expect(adapter.balance()).toBe(9400);
    adapter.earn(9400, "stripe:evt1", "retry must not double-credit");
    expect(adapter.balance()).toBe(9400);
    const after = adapter.recordDailyCost(3);
    expect(after).toBe(9400 - COST_SCHEDULE.hostingCentsPerDay * 3);
    const t = adapter.transfer("client-x", 1000, "partial payout");
    expect(t.status).toBe("completed");
    expect(adapter.balance()).toBe(9400 - COST_SCHEDULE.hostingCentsPerDay * 3 - 1000);
  });
});

describe("venkai infra client", () => {
  const config = { sshHost: "46.62.130.121", sshUser: "root", sshPort: 22, dockerImage: "ubuntu:24.04", baseDomain: "venkai.fr", sandboxPrefix: "venkai-agent" };

  it("runs docker through the ssh runner with quoting", async () => {
    const commands: string[] = [];
    const runner = { run: async (cmd: string) => { commands.push(cmd); return { stdout: "ok", stderr: "", exitCode: 0 }; } };
    const client = createVenkaiClient({ config, sandboxId: "sb-1", runner, models: [{ id: "m", provider: "mimo", pricing: { inputPerMillion: 0, outputPerMillion: 0 } }] });
    const res = await client.exec("echo hi");
    expect(res.exitCode).toBe(0);
    expect(commands[0]).toContain("docker");
    expect(commands[0]).toContain("exec");
    await client.writeFile("/root/x.txt", "hello");
    expect(commands[1]).toContain("base64 -d");
    const models = await client.listModels();
    expect(models[0].provider).toBe("mimo");
    const sandbox = await client.createSandbox({ vcpu: 2, memoryMb: 2048 });
    expect(sandbox.status).toBe("running");
    expect(commands[2]).toContain("--cpus");
  });

  it("rejects unsafe sandbox ids", () => {
    const runner = { run: async () => ({ stdout: "", stderr: "", exitCode: 0 }) };
    expect(() => createVenkaiClient({ config, sandboxId: "bad id; rm -rf /", runner })).toThrow();
    const ok = createVenkaiClient({ config, sandboxId: "ok-1", runner });
    expect(ok).toBeDefined();
    void loadInfraConfig;
  });
});

describe("mcp bridge", () => {
  it("lists and calls tools over json-rpc", async () => {
    const fakeFetch = async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; id: number };
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "tl_scan", description: "scan", inputSchema: { type: "object" } }] } }));
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "scanned" }] } }));
    };
    const client = createMcpClient("https://tl.venkai.fr/mcp", fakeFetch as never);
    const tools = await loadMcpBridgeTools(client, { category: "conway", namePrefix: "tl_" });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("tl_tl_scan");
    const out = await tools[0].execute({ q: "BTC" }, {} as never);
    expect(out).toContain("scanned");
  });
});

describe("worker pool", () => {
  it("inline pool handles ok and error", async () => {
    const pool = createInlinePool((t) => {
      if (t.task === "boom") throw new Error("nope");
      return { done: t.task };
    });
    expect((await pool.submit({ id: "1", task: "x" })).status).toBe("ok");
    expect((await pool.submit({ id: "2", task: "boom" })).status).toBe("error");
    await pool.close();
    void createWorkerPool;
  });
});

describe("skills bridge", () => {
  it("imports SKILL.md files from a hermes-style tree", () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-skills-"));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "automaton-skills-"));
    fs.mkdirSync(path.join(src, "cool-skill"), { recursive: true });
    fs.writeFileSync(path.join(src, "cool-skill", "SKILL.md"), "---\nname: cool-skill\ndescription: \"Does cool things\"\n---\n\n# Cool\n\nDo cool things.\n");
    const result = importHermesSkills(src, dest);
    expect(result.imported).toContain("cool-skill");
    const written = fs.readFileSync(path.join(dest, "cool-skill", "SKILL.md"), "utf8");
    expect(written).toContain("name: cool-skill");
    expect(written).toContain("Do cool things.");
  });
});
