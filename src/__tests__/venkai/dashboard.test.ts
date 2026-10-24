import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { createStore } from "../../venkai/dashboard/server.js";

describe("value dashboard store", () => {
  it("logs events and aggregates by every bucket", () => {
    const db = path.join(os.tmpdir(), `venkai-dash-${Date.now()}.db`);
    const store = createStore(db);
    store.log({ ts: new Date().toISOString(), kind: "revenue", label: "checkout", valueCents: 9400 });
    store.log({ ts: new Date().toISOString(), kind: "test", label: "suite verte" });
    store.log({ ts: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(), kind: "output", label: "old" });
    const totals = store.totals();
    expect(totals.revenue).toBe(9400);
    expect(totals.events).toBe(3);
    for (const b of ["minute", "hour", "day", "week", "month"] as const) {
      const s = store.summary(b);
      expect(s.length).toBeGreaterThanOrEqual(1);
    }
    expect(store.recent(2)[0].label).toBe("suite verte");
  });

  it("tracks the monetization funnel: click -> checkout -> paid", () => {
    const db = path.join(os.tmpdir(), `venkai-dash2-${Date.now()}.db`);
    const store = createStore(db);
    store.saveLink("pro-a", "https://buy.stripe.com/x", "direct");
    expect(store.getLink("pro-a")?.url).toBe("https://buy.stripe.com/x");
    const ts = new Date().toISOString();
    store.log({ ts, kind: "click", label: "pro-a", url: "reddit" });
    store.log({ ts, kind: "click", label: "pro-a", url: "reddit" });
    store.log({ ts, kind: "checkout", label: "pro-a", url: "reddit" });
    store.log({ ts, kind: "revenue", label: "pro-a", url: "reddit", valueCents: 9400 });
    const f = store.funnel();
    expect(f[0]).toMatchObject({ key: "pro-a", ch: "reddit", clicks: 2, checkouts: 1, paid: 1, revenue_cents: 9400, checkoutToPaid: 100 });
    const dump = store.dump();
    expect((dump.events as unknown[]).length).toBe(4);
    expect((dump.links as unknown[]).length).toBe(1);
  });
});
