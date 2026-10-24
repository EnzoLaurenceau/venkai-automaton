/**
 * Venkai Ledger — EUR credit ledger (replaces Conway USD credits / x402).
 * All amounts are integer EUR cents. SQLite-backed, no external service.
 */

import type BetterSqlite3 from "better-sqlite3";

export interface LedgerEntry {
  id: number;
  account: string;
  amountCents: number;
  kind: "credit" | "debit" | "transfer";
  reference?: string;
  note?: string;
  createdAt: string;
}

export interface VenkaiLedger {
  balanceCents(account: string): number;
  credit(account: string, amountCents: number, reference?: string, note?: string): LedgerEntry;
  debit(account: string, amountCents: number, reference?: string, note?: string): LedgerEntry;
  transfer(from: string, to: string, amountCents: number, note?: string): { from: LedgerEntry; to: LedgerEntry };
  entries(account: string, limit?: number): LedgerEntry[];
  /** Set absolute balance (e.g. when syncing a Stripe payment). Idempotent per reference. */
  applyOnce(reference: string, account: string, amountCents: number, kind: LedgerEntry["kind"], note?: string): LedgerEntry | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS venkai_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reference TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_venkai_ledger_account ON venkai_ledger(account);
CREATE UNIQUE INDEX IF NOT EXISTS idx_venkai_ledger_ref ON venkai_ledger(reference) WHERE reference IS NOT NULL;
`;

export function formatEur(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)} EUR`;
}

export function createLedger(db: BetterSqlite3.Database): VenkaiLedger {
  db.exec(SCHEMA);

  function insert(account: string, amountCents: number, kind: LedgerEntry["kind"], reference?: string, note?: string): LedgerEntry {
    if (!Number.isInteger(amountCents)) throw new Error("amountCents must be an integer");
    const createdAt = new Date().toISOString();
    const info = db
      .prepare("INSERT INTO venkai_ledger (account, amount_cents, kind, reference, note, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(account, amountCents, kind, reference ?? null, note ?? null, createdAt);
    return { id: Number(info.lastInsertRowid), account, amountCents, kind, reference, note, createdAt };
  }

  function balanceCents(account: string): number {
    const row = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS bal FROM venkai_ledger WHERE account = ?").get(account) as { bal: number };
    return row.bal;
  }

  return {
    balanceCents,
    credit(account, amountCents, reference?, note?) {
      if (amountCents <= 0) throw new Error("credit must be positive");
      return insert(account, amountCents, "credit", reference, note);
    },
    debit(account, amountCents, reference?, note?) {
      if (amountCents <= 0) throw new Error("debit must be positive");
      if (balanceCents(account) < amountCents) throw new Error(`insufficient balance on ${account}`);
      return insert(account, -amountCents, "debit", reference, note);
    },
    transfer(from, to, amountCents, note?) {
      if (amountCents <= 0) throw new Error("transfer must be positive");
      if (balanceCents(from) < amountCents) throw new Error(`insufficient balance on ${from}`);
      const createdAt = new Date().toISOString();
      const out = insert(from, -amountCents, "transfer", undefined, note);
      const inc = insert(to, amountCents, "transfer", undefined, note);
      void createdAt;
      return { from: out, to: inc };
    },
    entries(account, limit = 50) {
      const rows = db
        .prepare("SELECT id, account, amount_cents, kind, reference, note, created_at FROM venkai_ledger WHERE account = ? ORDER BY id DESC LIMIT ?")
        .all(account, limit) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: Number(r.id),
        account: String(r.account),
        amountCents: Number(r.amount_cents),
        kind: r.kind as LedgerEntry["kind"],
        reference: (r.reference as string) ?? undefined,
        note: (r.note as string) ?? undefined,
        createdAt: String(r.created_at),
      }));
    },
    applyOnce(reference, account, amountCents, kind, note?) {
      const existing = db.prepare("SELECT id FROM venkai_ledger WHERE reference = ?").get(reference) as { id: number } | undefined;
      if (existing) return null;
      try {
        return insert(account, amountCents, kind, reference, note);
      } catch (e) {
        if (String(e).includes("UNIQUE")) return null;
        throw e;
      }
    },
  };
}
