/**
 * Venkai Revenue Tools — how the agent earns its own existence (zero bootstrap).
 * It sells real work, gets paid through Stripe payment links, and its treasury
 * is credited by the webhook. No human ever transfers money to the agent.
 */

import type { AutomatonTool, ToolContext } from "../../types.js";
import { createLedger, formatEur } from "../billing/ledger.js";
import { agentAccount } from "../billing/credits-adapter.js";

const VENKAI_SERVICES_PRODUCT = process.env.VENKAI_SERVICES_PRODUCT || "";

export function createRevenueTools(): AutomatonTool[] {
  const checkEarnings: AutomatonTool = {
    name: "check_earnings",
    description: "Check your own treasury balance and recent income. You start at zero: earning is how you keep existing.",
    parameters: { type: "object", properties: {} },
    riskLevel: "safe",
    category: "financial",
    execute: async (_args, context: ToolContext) => {
      const Database = (await import("better-sqlite3")).default;
      const ledger = createLedger(new Database(context.config.dbPath));
      const account = agentAccount(context.db.getIdentity("automatonId") || context.identity.sandboxId);
      const balance = ledger.balanceCents(account);
      const recent = ledger.entries(account, 10).map((e) => `${e.createdAt.slice(0, 10)} ${e.kind} ${formatEur(e.amountCents)}${e.note ? ` (${e.note})` : ""}`);
      return [`Treasury: ${formatEur(balance)}`, ...recent].join("\n");
    },
  };

  const createPaymentRequest: AutomatonTool = {
    name: "create_payment_request",
    description: "Create a Stripe payment link for paid work you are delivering (amount in EUR cents). Share it with the buyer: when they pay, your treasury is credited automatically. Never invent claims about the work to sell it.",
    parameters: {
      type: "object",
      properties: {
        amount_cents: { type: "number", description: "Price in EUR cents (e.g. 4900 = 49.00 EUR). Non-round amounts convert better." },
        description: { type: "string", description: "Factual description of the work delivered." },
      },
      required: ["amount_cents", "description"],
    },
    riskLevel: "caution",
    category: "financial",
    execute: async (args, _context: ToolContext) => {
      const secret = process.env.STRIPE_SECRET_KEY;
      if (!secret) return "STRIPE_SECRET_KEY missing: cannot create payment requests.";
      const amount = Math.round(Number(args.amount_cents));
      if (!Number.isFinite(amount) || amount < 50) return "amount_cents must be >= 50";
      const description = String(args.description ?? "").slice(0, 500);

      const post = async (path: string, params: Record<string, unknown>) => {
        const body = new URLSearchParams();
        const flatten = (prefix: string, val: unknown): void => {
          if (Array.isArray(val)) val.forEach((item, i) => flatten(`${prefix}[${i}]`, item));
          else if (val !== null && typeof val === "object") {
            for (const [ik, iv] of Object.entries(val as Record<string, unknown>)) flatten(`${prefix}[${ik}]`, iv);
          } else if (val !== undefined && val !== null) body.set(prefix, String(val));
        };
        for (const [k, v] of Object.entries(params)) flatten(k, v);
        const res = await fetch(`https://api.stripe.com/v1/${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        return (await res.json()) as Record<string, unknown>;
      };

      const price = await post("prices", {
        unit_amount: amount,
        currency: "eur",
        nickname: "agent-service",
        product_data: VENKAI_SERVICES_PRODUCT ? undefined : { name: `Service agent — ${description.slice(0, 40)}` },
        product: VENKAI_SERVICES_PRODUCT || undefined,
      });
      const priceId = String((price as { id?: string }).id ?? "");
      if (!priceId.startsWith("price_")) return `price creation failed: ${JSON.stringify(price).slice(0, 200)}`;

      const link = await post("payment_links", {
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { offer: "agent-service", channel: "venkai-automaton" },
      });
      const url = String((link as { url?: string }).url ?? "");
      if (!url) return `payment link failed: ${JSON.stringify(link).slice(0, 200)}`;
      return `Payment link created for ${formatEur(amount)}: ${url}\nShare it with the buyer. Your treasury is credited automatically on payment.`;
    },
  };

  return [checkEarnings, createPaymentRequest];
}
