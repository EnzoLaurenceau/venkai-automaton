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
});
