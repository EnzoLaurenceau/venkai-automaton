/**
 * Venkai Value Dashboard — real-time evidence of why the agent deserves to live.
 * Granularities: minute / hour / day / week / month. Zero dependencies (node:http + SQLite).
 * SSE stream for live updates. The agent logs its value events here.
 */

import http from "node:http";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";

export interface ValueEvent {
  ts: string;
  kind: "revenue" | "cost" | "output" | "growth" | "infra" | "test" | "code" | "click" | "checkout";
  label: string;
  valueCents?: number;
  url?: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS venkai_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  value_cents INTEGER DEFAULT 0,
  url TEXT
);
CREATE INDEX IF NOT EXISTS idx_venkai_events_ts ON venkai_events(ts);
CREATE TABLE IF NOT EXISTS venkai_links (
  key TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  channel TEXT DEFAULT 'direct',
  created_at TEXT NOT NULL
);
`;

export function createStore(dbPath: string) {
  const db = new Database(dbPath);
  db.exec(SCHEMA);
  return {
    db: db as BetterSqlite3.Database,
    log(e: ValueEvent): void {
      db.prepare("INSERT INTO venkai_events (ts, kind, label, value_cents, url) VALUES (?, ?, ?, ?, ?)").run(e.ts, e.kind, e.label, e.valueCents ?? 0, e.url ?? null);
    },
    summary(bucket: "minute" | "hour" | "day" | "week" | "month", limit = 60) {
      const fmt = { minute: "%Y-%m-%dT%H:%M", hour: "%Y-%m-%dT%H", day: "%Y-%m-%d", week: "%Y-W%W", month: "%Y-%m" }[bucket];
      const rows = db
        .prepare(
          `SELECT strftime('${fmt}', ts) AS b, kind,
                  COUNT(*) AS n, COALESCE(SUM(value_cents),0) AS cents
           FROM venkai_events GROUP BY b, kind ORDER BY b DESC LIMIT ?`,
        )
        .all(limit * 8) as Array<{ b: string; kind: string; n: number; cents: number }>;
      const byBucket = new Map<string, Record<string, { n: number; cents: number }>>();
      for (const r of rows) {
        if (!byBucket.has(r.b)) byBucket.set(r.b, {});
        byBucket.get(r.b)![r.kind] = { n: r.n, cents: r.cents };
      }
      return [...byBucket.entries()].map(([b, kinds]) => ({ bucket: b, kinds }));
    },
    totals() {
      const row = db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN kind='revenue' THEN value_cents ELSE 0 END),0) AS revenue,
        COALESCE(SUM(CASE WHEN kind='cost' THEN value_cents ELSE 0 END),0) AS cost,
        COUNT(*) AS events,
        COALESCE(SUM(CASE WHEN kind='output' THEN 1 ELSE 0 END),0) AS outputs,
        COALESCE(SUM(CASE WHEN kind='growth' THEN 1 ELSE 0 END),0) AS growth,
        COALESCE(SUM(CASE WHEN kind='test' THEN 1 ELSE 0 END),0) AS tests
      FROM venkai_events`).get() as Record<string, number>;
      return row;
    },
    saveLink(key: string, url: string, channel = "direct"): void {
      db.prepare("INSERT OR REPLACE INTO venkai_links (key, url, channel, created_at) VALUES (?, ?, ?, ?)").run(key, url, channel, new Date().toISOString());
    },
    getLink(key: string): { key: string; url: string; channel: string } | undefined {
      return db.prepare("SELECT key, url, channel FROM venkai_links WHERE key = ?").get(key) as { key: string; url: string; channel: string } | undefined;
    },
    listLinks(): Array<{ key: string; url: string; channel: string }> {
      return db.prepare("SELECT key, url, channel FROM venkai_links ORDER BY key").all() as Array<{ key: string; url: string; channel: string }>;
    },
    /** Full monetization funnel per link and channel: clicks -> checkouts -> paid. */
    funnel() {
      const rows = db.prepare(`
        SELECT label AS key,
               COALESCE(url,'') AS ch,
               SUM(CASE WHEN kind='click' THEN 1 ELSE 0 END) AS clicks,
               SUM(CASE WHEN kind='checkout' THEN 1 ELSE 0 END) AS checkouts,
               SUM(CASE WHEN kind='revenue' THEN 1 ELSE 0 END) AS paid,
               COALESCE(SUM(CASE WHEN kind='revenue' THEN value_cents ELSE 0 END),0) AS revenue_cents
        FROM venkai_events
        WHERE kind IN ('click','checkout','revenue')
        GROUP BY label, ch
        ORDER BY revenue_cents DESC, clicks DESC
      `).all() as Array<{ key: string; ch: string; clicks: number; checkouts: number; paid: number; revenue_cents: number }>;
      return rows.map((r) => ({
        ...r,
        clickToCheckout: r.clicks > 0 ? +(r.checkouts / r.clicks * 100).toFixed(1) : 0,
        checkoutToPaid: r.checkouts > 0 ? +(r.paid / r.checkouts * 100).toFixed(1) : 0,
      }));
    },
    /** Raw export so nothing is ever lost. */
    dump() {
      return {
        events: db.prepare("SELECT ts, kind, label, value_cents, url FROM venkai_events ORDER BY ts").all(),
        links: db.prepare("SELECT * FROM venkai_links").all(),
      };
    },
    recent(limit = 15) {
      return (db.prepare("SELECT ts, kind, label, value_cents, url FROM venkai_events ORDER BY ts DESC, id DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>).map((r) => ({
        ts: String(r.ts),
        kind: String(r.kind),
        label: String(r.label),
        valueCents: Number(r.value_cents),
        url: (r.url as string) ?? undefined,
      }));
    },
  };
}

export type Store = ReturnType<typeof createStore>;

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Venkai Automaton - Value Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
 body{font-family:ui-monospace,Consolas,monospace;background:#0b0e14;color:#d7e0ea;margin:0;padding:24px}
 h1{font-size:18px} .muted{color:#7b8ba3;font-size:12px}
 .cards{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
 .card{background:#131a26;border:1px solid #223047;border-radius:8px;padding:12px 16px;min-width:150px}
 .card .v{font-size:22px;font-weight:700;color:#6ee7ff} .card .l{font-size:11px;color:#7b8ba3;text-transform:uppercase}
 .tabs button{background:#131a26;color:#d7e0ea;border:1px solid #223047;padding:6px 12px;margin-right:6px;border-radius:6px;cursor:pointer}
 .tabs button.on{background:#1d4ed8;border-color:#1d4ed8}
 .chart{display:flex;align-items:flex-end;gap:4px;height:140px;margin:14px 0}
 .bar{flex:1;background:#1d4ed8;border-radius:3px 3px 0 0;min-width:6px}
 .bar.rev{background:#22c55e} .bar.cost{background:#ef4444}
 table{width:100%;border-collapse:collapse;font-size:12px}
 td,th{border-bottom:1px solid #223047;padding:6px;text-align:left}
 .badge{padding:2px 8px;border-radius:10px;font-size:10px;background:#223047}
 .revenue{background:#14351f;color:#4ade80}.cost{background:#3b1519;color:#f87171}
 .growth{background:#1e293b;color:#7dd3fc}.output{background:#2a2140;color:#c4b5fd}
</style></head><body>
<h1>VENKAI AUTOMATON - pourquoi le garder en vie <span class="muted">temps reel</span></h1>
<div class="muted" id="clock"></div>
<div class="cards" id="cards"></div>
<div class="tabs" id="tabs"></div>
<div class="chart" id="chart"></div>
<h2 style="font-size:14px">Entonnoir monetisation (clics -> checkout -> paye, par source)</h2>
<table id="funnel"><thead><tr><th>Lien</th><th>Source</th><th>Clics</th><th>Checkouts</th><th>Payes</th><th>Conv. %</th><th>Revenus</th></tr></thead><tbody></tbody></table>
<h2 style="font-size:14px">Raisons recentes (preuves de valeur)</h2>
<table id="recent"><thead><tr><th>Quand</th><th>Type</th><th>Preuve</th><th>Valeur</th></tr></thead><tbody></tbody></table>
<script>
let bucket='day';
const tabs=['minute','hour','day','week','month'];
function el(id){return document.getElementById(id)}
function money(c){return (c/100).toFixed(2)+' EUR'}
async function refresh(){
  const [totals,recent,summary,funnel]=await Promise.all([
    fetch('/api/totals').then(r=>r.json()),
    fetch('/api/recent').then(r=>r.json()),
    fetch('/api/summary?bucket='+bucket).then(r=>r.json()),
    fetch('/api/funnel').then(r=>r.json()),
  ]);
  el('clock').textContent=new Date().toLocaleString('fr-BE')+' - '+location.host;
  el('cards').innerHTML=[
    ['Tresorerie nette', money(totals.revenue-totals.cost)],
    ['Revenus', money(totals.revenue)],
    ['Couts', money(totals.cost)],
    ['Evenements', totals.events],
    ['Travaux livres', totals.outputs],
    ['Tests', totals.tests],
    ['Croissance', totals.growth],
  ].map(([l,v])=>'<div class="card"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>').join('');
  el('tabs').innerHTML=tabs.map(t=>'<button class="'+(t===bucket?'on':'')+'" onclick="setBucket(\''+t+'\')">'+t+'</button>').join('');
  const rows=summary.slice(0,24).reverse();
  const max=Math.max(1,...rows.map(r=>Object.values(r.kinds).reduce((a,k)=>a+k.n,0)));
  el('chart').innerHTML=rows.map(r=>{
    const n=Object.values(r.kinds).reduce((a,k)=>a+k.n,0);
    const rev=r.kinds.revenue?r.kinds.revenue.cents:0;
    const cls=rev>0?'bar rev':(r.kinds.cost?'bar cost':'bar');
    return '<div class="'+cls+'" style="height:'+Math.max(4,(n/max)*140)+'px" title="'+r.bucket+' ('+n+')"></div>';
  }).join('');
  el('funnel').querySelector('tbody').innerHTML=funnel.map(f=>
    '<tr><td>'+f.key+'</td><td>'+(f.ch||'direct')+'</td><td>'+f.clicks+'</td><td>'+f.checkouts+'</td><td>'+f.paid+'</td><td>'+
    (f.checkouts? f.checkoutToPaid : f.clickToCheckout)+'%</td><td>'+money(f.revenue_cents)+'</td></tr>').join('') ||
    '<tr><td colspan="7" class="muted">Aucun clic tracke pour l\'instant</td></tr>';
  el('recent').querySelector('tbody').innerHTML=recent.map(r=>
    '<tr><td>'+r.ts.replace('T',' ')+'</td><td><span class="badge '+r.kind+'">'+r.kind+'</span></td><td>'+
    (r.url?'<a href="'+r.url+'" style="color:#7dd3fc">'+r.label+'</a>':r.label)+'</td><td>'+(r.valueCents?money(r.valueCents):'')+'</td></tr>').join('');
}
function setBucket(b){bucket=b;refresh()}
refresh(); setInterval(refresh,15000);
new EventSource('/stream').onmessage=()=>refresh();
</script></body></html>`;

export function startDashboard(dbPath: string, port = 7787): http.Server {
  const store = createStore(dbPath);
  const clients = new Set<http.ServerResponse>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE);
    } else if (url.pathname === "/api/totals") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(store.totals()));
    } else if (url.pathname === "/api/recent") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(store.recent(20)));
    } else if (url.pathname === "/api/summary") {
      const bucket = (url.searchParams.get("bucket") ?? "day") as "minute" | "hour" | "day" | "week" | "month";
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(store.summary(bucket)));
    } else if (url.pathname.startsWith("/go/")) {
      // Tracked link: /go/<key>?ch=<channel> -> redirects to the payment link and logs the click.
      const key = url.pathname.slice(4);
      const link = store.getLink(key);
      if (!link) {
        res.writeHead(404).end("unknown link");
        return;
      }
      const ch = url.searchParams.get("ch") || link.channel || "direct";
      store.log({ ts: new Date().toISOString(), kind: "click", label: key, url: ch });
      res.writeHead(302, { Location: link.url }).end();
    } else if (url.pathname === "/api/funnel") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(store.funnel()));
    } else if (url.pathname === "/api/export") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(store.dump()));
    } else if (url.pathname === "/api/links") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(store.listLinks()));
    } else if (url.pathname === "/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write("data: hello\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
    } else {
      res.writeHead(404).end();
    }
  });

  const broadcast = (): void => {
    for (const c of clients) c.write(`data: ${Date.now()}\n\n`);
  };
  setInterval(broadcast, 15000).unref();
  server.listen(port);
  return server;
}
