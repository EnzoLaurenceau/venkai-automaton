/**
 * Venkai Provisioner — turns a Stripe payment into a working agent, automatically.
 * Hetzner (sandbox) + Cloudflare (DNS *.venkai.fr) + Resend (email) + Slack (alert).
 * Every network call goes through an injectable fetch for tests. Keys come from env only.
 */

export interface ProvisionerEnv {
  hetznerApiKey?: string;
  cloudflareApiToken?: string;
  cloudflareZoneId?: string;
  resendApiKey?: string;
  slackWebhookUrl?: string;
  baseDomain?: string;
  serverType?: string;
  location?: string;
  sshKeyName?: string;
}

export interface Customer {
  email: string;
  name?: string;
  offer: string;
  stripeSessionId?: string;
}

export interface ProvisionResult {
  serverId?: string;
  serverIp?: string;
  subdomain: string;
  emailSent: boolean;
  slackNotified: boolean;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function loadProvisionerEnv(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): ProvisionerEnv {
  return {
    hetznerApiKey: env.HETZNER_API_KEY,
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
    cloudflareZoneId: env.CLOUDFLARE_ACCOUNT_ID,
    resendApiKey: env.RESEND_API_KEY,
    slackWebhookUrl: env.SLACK_VENKAI_BOT?.startsWith("http") ? env.SLACK_VENKAI_BOT : undefined,
    baseDomain: env.VENKAI_BASE_DOMAIN || "venkai.fr",
  };
}

function slug(email: string): string {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30) || "agent";
}

export function createProvisioner(env: ProvisionerEnv, fetcher: Fetcher = fetch) {
  async function hetzner(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
    if (!env.hetznerApiKey) throw new Error("HETZNER_API_KEY missing");
    const res = await fetcher(`https://api.hetzner.cloud/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.hetznerApiKey}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(`hetzner ${method} ${path}: ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  }

  async function cloudflareDns(name: string, content: string): Promise<void> {
    if (!env.cloudflareApiToken || !env.cloudflareZoneId) return; // wildcard *.venkai.fr may already cover it
    const zoneId = env.cloudflareZoneId;
    await fetcher(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.cloudflareApiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "A", name: `${name}.${env.baseDomain}`, content, ttl: 300 }),
    });
  }

  async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!env.resendApiKey) return false;
    const res = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Venkai <agents@venkai.fr>", to: [to], subject, html }),
    });
    return res.ok;
  }

  async function slack(text: string): Promise<boolean> {
    if (!env.slackWebhookUrl) return false;
    const res = await fetcher(env.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  }

  return {
    /** Provision one customer agent. Idempotency is the caller's job (webhook dedup). */
    async provision(customer: Customer): Promise<ProvisionResult> {
      const subdomain = `${slug(customer.email)}-${Math.random().toString(36).slice(2, 6)}`;
      let serverId: string | undefined;
      let serverIp: string | undefined;

      if (env.hetznerApiKey) {
        const created = (await hetzner("servers", "POST", {
          name: `venkai-agent-${subdomain}`,
          server_type: env.serverType || "cx22",
          image: "ubuntu-24.04",
          location: env.location || "fsn1",
          ssh_keys: env.sshKeyName ? [env.sshKeyName] : undefined,
          labels: { venkai: "automaton", offer: customer.offer, customer: customer.email },
        })) as { server?: { id?: number; public_net?: { ipv4?: { ip?: string } } } };
        serverId = created.server?.id ? String(created.server.id) : undefined;
        serverIp = created.server?.public_net?.ipv4?.ip;
        if (serverIp) await cloudflareDns(subdomain, serverIp);
      }

      const emailSent = await sendEmail(
        customer.email,
        "Votre agent Venkai est en cours de création",
        `<p>Bonjour,</p><p>Merci pour votre achat (${customer.offer}). Votre agent est provisionné : <b>${subdomain}.${env.baseDomain}</b>.</p><p>Vous recevrez les accès dès que l'installation est terminée.</p><p>L'équipe Venkai</p>`,
      );
      const slackNotified = await slack(
        `:robot_face: Nouveau paiement Stripe → agent provisionné\nOffre: ${customer.offer}\nClient: ${customer.email}\nSubdomain: ${subdomain}.${env.baseDomain}\nServeur: ${serverId ?? "n/a"} (${serverIp ?? "n/a"})`,
      );

      return { serverId, serverIp, subdomain, emailSent, slackNotified };
    },
  };
}

export type Provisioner = ReturnType<typeof createProvisioner>;
