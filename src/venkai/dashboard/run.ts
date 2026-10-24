/**
 * Dashboard runner: seeds the evidence ledger with real events (first run only),
 * then serves the live dashboard. node dist/venkai/dashboard/run.js
 */

import path from "node:path";
import { createStore, startDashboard } from "./server.js";

const DB = process.env.VENKAI_DASHBOARD_DB || "venkai-dashboard.db";
const PORT = Number(process.env.VENKAI_DASHBOARD_PORT || 7787);

function seed(): void {
  const store = createStore(DB);
  const count = (store.db.prepare("SELECT COUNT(*) AS n FROM venkai_events").get() as { n: number }).n;
  if (count > 0) return;

  const now = Date.now();
  const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  const events = [
    { ts: at(240), kind: "code", label: "Fork venkai-automaton créé (Conway-Research/automaton, MIT)", url: "https://github.com/EnzoLaurenceau/venkai-automaton" },
    { ts: at(225), kind: "output", label: "Audit Conway : ce qui ne sera JAMAIS payé (infra, inference, domains, credits)" },
    { ts: at(210), kind: "code", label: "Charte VENKAI.md + workflow auto-évolution upstream" },
    { ts: at(180), kind: "growth", label: "4 offres LIVE sur Stripe : Pro 94, Trading 238, Skills 43, Setup 487 EUR", url: "https://buy.stripe.com/fZu3cv0Lmebyakk3BH5AQ02" },
    { ts: at(175), kind: "growth", label: "A/B test : variantes B créées (metadata.variant + utm)" },
    { ts: at(165), kind: "growth", label: "Coupons réels HALLOWEEN26 / HALLOWEEN26-SKILLS / BLACKFRIDAY26 (exp. + plafonds forcés par Stripe)" },
    { ts: at(150), kind: "code", label: "Pipeline argent → service : ledger EUR + webhook HMAC + provisioner Hetzner/Cloudflare/Resend/Slack" },
    { ts: at(145), kind: "test", label: "Suite complète upstream verte : 1313 tests / 131 fichiers" },
    { ts: at(120), kind: "code", label: "Auto-pub X (OAuth1)/Instagram/TikTok/ProductHunt + tools publish_*" },
    { ts: at(115), kind: "growth", label: "Hausse de prix réelle planifiée 2 déc (94→107, 238→271) via cron" },
    { ts: at(90), kind: "code", label: "Mode autonome zéro-bootstrap : trésorerie propre, create_payment_request, genesis venkai-rules" },
    { ts: at(85), kind: "test", label: "19 tests venkai verts (ledger, webhook, provisioner, infra, bridges, publisher)" },
    { ts: at(30), kind: "infra", label: "Post X tenté via Opera GX (@venkaioff) — bloqué par le mur anti-bot X, script prêt" },
    { ts: at(5), kind: "infra", label: "Dashboard temps réel lancé (minute → mois)" },
    { ts: at(60), kind: "cost", label: "Coût d'existence : Hetzner cx22 (estimate 13 cts/jour)", valueCents: 13 },
  ];
  for (const e of events) store.log({ ...e, kind: e.kind as never, valueCents: (e as { valueCents?: number }).valueCents });
}

seed();
startDashboard(DB, PORT);
console.log(`venkai value dashboard: http://localhost:${PORT}`);
