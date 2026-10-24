/**
 * Venkai webhook server — Stripe checkout.session.completed → provision automatically.
 * Run: node dist/venkai/billing/webhook-server.js  (env: STRIPE_WEBHOOK_SECRET, PORT)
 * Idempotent per Stripe event id (dedup table), so Stripe retries never double-provision.
 */

import http from "node:http";
import Database from "better-sqlite3";
import { verifyWebhookSignature, offerFromEvent, monthlyAllowanceFor, type StripeEvent } from "./stripe-billing.js";
import { createLedger, type VenkaiLedger } from "./ledger.js";
import { createProvisioner, loadProvisionerEnv, type Provisioner } from "./provisioner.js";

export interface WebhookDeps {
  secret: string;
  ledger: VenkaiLedger;
  provisioner: Provisioner;
  db: Database.Database;
  now?: () => number;
}

export interface WebhookOutcome {
  status: number;
  body: string;
}

function ensureDedup(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS venkai_webhook_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, processed_at TEXT NOT NULL);`);
}

export function createWebhookHandler(deps: WebhookDeps): (payload: string, signature: string | undefined) => WebhookOutcome {
  ensureDedup(deps.db);
  const { secret, ledger, provisioner } = deps;

  return (payload: string, signature?: string): WebhookOutcome => {
    if (!signature || !verifyWebhookSignature(payload, signature, secret, 300, deps.now?.())) {
      return { status: 400, body: "invalid signature" };
    }
    let event: StripeEvent;
    try {
      event = JSON.parse(payload) as StripeEvent;
    } catch {
      return { status: 400, body: "invalid json" };
    }

    const dedup = deps.db.prepare("SELECT id FROM venkai_webhook_events WHERE id = ?").get(event.id);
    if (dedup) return { status: 200, body: "already processed" };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Record<string, unknown>;
      const offer = offerFromEvent(event);
      const email = String(session.customer_details ? (session.customer_details as { email?: string }).email ?? "" : "");
      const amount = Number(session.amount_total ?? 0);

      if (offer) {
        ledger.applyOnce(`stripe:${event.id}`, `customer:${email || String(session.id)}`, amount || monthlyAllowanceFor(offer), "credit", `checkout ${offer}`);
        void provisioner.provision({ email, offer, stripeSessionId: String(session.id) }).catch(() => undefined);
      }
    }

    deps.db.prepare("INSERT INTO venkai_webhook_events (id, type, processed_at) VALUES (?, ?, ?)").run(event.id, event.type, new Date().toISOString());
    return { status: 200, body: "ok" };
  };
}

export function startWebhookServer(port = Number(process.env.PORT || 8787)): http.Server {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_LIVE || "";
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET missing");
  const db = new Database(process.env.VENKAI_LEDGER_DB || "venkai-ledger.db");
  const handler = createWebhookHandler({
    secret,
    ledger: createLedger(db),
    provisioner: createProvisioner(loadProvisionerEnv()),
    db,
  });

  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/api/stripe/webhook") {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const payload = Buffer.concat(chunks).toString("utf8");
      const { status, body } = handler(payload, req.headers["stripe-signature"] as string | undefined);
      res.writeHead(status, { "Content-Type": "text/plain" }).end(body);
    });
  });
  server.listen(port);
  return server;
}

if (process.argv[1] && process.argv[1].endsWith("webhook-server.js")) {
  startWebhookServer();
  console.log("venkai webhook server listening (Stripe -> provision)");
}
