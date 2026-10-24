/**
 * Venkai Credits Adapter — survival economics for the self-financing agent.
 * The agent's "credits" are its own EUR ledger balance. Nobody funds it: it starts
 * at zero and earns its existence (constitution Law II). Costs are debited so the
 * survival tiers (normal / low_compute / critical / dead) react to real economics.
 */

import Database from "better-sqlite3";
import { createLedger, type VenkaiLedger } from "./ledger.js";
import type { CreditTransferResult } from "../../types.js";

/** Internal cost accounting (estimates, EUR cents). Infra is already paid by the
 *  owner; these debits exist so the agent behaves as if its existence has a cost. */
export const COST_SCHEDULE = {
  hostingCentsPerDay: 13, // Hetzner cx22 ~3.85 EUR/mo (estimate)
  inferenceCentsPer1kTokens: 0, // MiMo plan + local models: marginal cost 0
};

export function agentAccount(agentId: string): string {
  return `agent:${agentId}`;
}

export interface VenkaiCreditsAdapter {
  balance(): number;
  transfer(toAddress: string, amountCents: number, note?: string): CreditTransferResult;
  ledger: VenkaiLedger;
  account: string;
  /** Debit the daily cost of existing. Returns the new balance. */
  recordDailyCost(days?: number): number;
  /** Record revenue the agent earned (from Stripe webhook or direct work). */
  earn(amountCents: number, reference?: string, note?: string): void;
}

export function createVenkaiCreditsAdapter(dbPath: string, agentId: string): VenkaiCreditsAdapter {
  const db = new Database(dbPath);
  const ledger = createLedger(db);
  const account = agentAccount(agentId);

  return {
    ledger,
    account,
    balance: () => ledger.balanceCents(account),
    transfer(toAddress, amountCents, note) {
      const to = toAddress.startsWith("agent:") || toAddress.startsWith("customer:") ? toAddress : `agent:${toAddress}`;
      ledger.transfer(account, to, amountCents, note);
      return {
        transferId: `venkai-${Date.now()}`,
        status: "completed",
        toAddress,
        amountCents,
        balanceAfterCents: ledger.balanceCents(account),
      };
    },
    recordDailyCost(days = 1) {
      const cost = COST_SCHEDULE.hostingCentsPerDay * days;
      const bal = ledger.balanceCents(account);
      if (bal >= cost) ledger.debit(account, cost, undefined, `hosting ${days}d (estimate)`);
      // Zero balance: no entry, tier logic handles the "critical" state itself.
      return ledger.balanceCents(account);
    },
    earn(amountCents, reference, note) {
      ledger.applyOnce(reference ?? `earn-${Date.now()}-${Math.random()}`, account, amountCents, "credit", note);
    },
  };
}
