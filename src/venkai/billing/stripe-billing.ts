/**
 * Venkai Stripe billing — no stripe SDK dependency (fetch + node:crypto).
 * Entitlements come from price "nickname" (automaton-pro / trading / skills / setup).
 */

import crypto from "node:crypto";

export type OfferKey = "automaton-pro" | "automaton-trading" | "automaton-skills" | "automaton-setup";

export interface Entitlement {
  offer: OfferKey;
  kind: "subscription" | "one-shot";
  /** Monthly EUR cents credited to the customer's agent budget. */
  monthlyAllowanceCents: number;
}

export const ENTITLEMENTS: Record<OfferKey, Entitlement> = {
  "automaton-pro": { offer: "automaton-pro", kind: "subscription", monthlyAllowanceCents: 9400 },
  "automaton-trading": { offer: "automaton-trading", kind: "subscription", monthlyAllowanceCents: 23800 },
  "automaton-skills": { offer: "automaton-skills", kind: "one-shot", monthlyAllowanceCents: 4300 },
  "automaton-setup": { offer: "automaton-setup", kind: "one-shot", monthlyAllowanceCents: 48700 },
};

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Verify a Stripe webhook signature (t=...,v1=...) against the raw payload.
 * Standard scheme: HMAC-SHA256 over `${t}.${payload}` with the endpoint secret.
 */
export function verifyWebhookSignature(payload: string, header: string, secret: string, toleranceSec = 300, now = Date.now()): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extract the offer key from a checkout session or invoice payment event. */
export function offerFromEvent(event: StripeEvent): OfferKey | null {
  const obj = event.data.object;
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  if (meta.offer && meta.offer in ENTITLEMENTS) return meta.offer as OfferKey;
  // payment_link metadata carries our key
  const pl = (obj.payment_link ?? "") as string;
  if (pl) {
    const links = (obj.line_items as { data?: Array<{ price?: { nickname?: string } }> } | undefined)?.data ?? [];
    for (const li of links) {
      const nick = li.price?.nickname;
      if (nick && nick in ENTITLEMENTS) return nick as OfferKey;
    }
  }
  return null;
}

export interface StripeClient {
  get(path: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  post(path: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createStripeClient(secretKey: string): StripeClient {
  async function call(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const url = new URL(`https://api.stripe.com/v1/${path}`);
    const body = new URLSearchParams();
    const flatten = (prefix: string, val: unknown): void => {
      if (Array.isArray(val)) val.forEach((item, i) => flatten(`${prefix}[${i}]`, item));
      else if (val !== null && typeof val === "object") {
        for (const [ik, iv] of Object.entries(val as Record<string, unknown>)) flatten(`${prefix}[${ik}]`, iv);
      } else if (val !== undefined && val !== null) body.set(prefix, String(val));
    };
    if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    else for (const [k, v] of Object.entries(params)) flatten(k, v);
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: method === "POST" ? body : undefined,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(`stripe ${method} ${path}: ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
    return json;
  }
  return { get: (p, params) => call("GET", p, params), post: (p, params) => call("POST", p, params) };
}

/** Budget credited to the agent per month for each offer (EUR cents). */
export function monthlyAllowanceFor(offer: OfferKey): number {
  return ENTITLEMENTS[offer].monthlyAllowanceCents;
}
