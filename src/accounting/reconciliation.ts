/**
 * Zande Accounting Engine v2 — Reconciliation Module
 *
 * Acts as a data integrity gate. Verifies that:
 *
 *   Total Invoices - Total Payments = Accounts Receivable
 *
 * If this check fails, the engine's output cannot be trusted.
 * This should be run before generating any critical reports.
 *
 * Rules:
 *  - Total Invoiced: SUM of all non-void, non-draft invoice totals (all time)
 *  - Total Payments: SUM of all payments received (all time)
 *  - Calculated AR: Total Invoiced - Total Payments
 *  - Ledger AR: SUM of AR account balance from ledger_entries
 *  - Delta: abs(calculated_ar - ledger_ar_balance) — should be 0
 *
 * Note: A non-zero delta does NOT necessarily mean a bug. It can indicate:
 *  - Invoices created before the ledger engine was deployed (pre-migration data)
 *  - Manual adjustments not yet reconciled
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { supabase } from '../lib/supabase';
import type { ReconciliationResult } from './types';

/**
 * Runs the full reconciliation check for a business.
 * Returns pass/fail + delta for display in the Accounts page.
 *
 * @param businessId - The business UUID
 */
export async function reconcile(
  businessId: string
): Promise<ReconciliationResult> {
  // Fetch total of all valid (non-void/draft) invoices
  const { data: allInvoices, error: invError } = await supabase
    .from('invoices')
    .select('total, status')
    .eq('business_id', businessId);

  if (invError) {
    throw new Error(`[Reconciliation] Invoices error: ${invError.message}`);
  }

  // Filter in JS for maximum resilience to database enum differences
  const invoiceData = (allInvoices ?? []).filter(inv => {
    const status = (inv.status || '').toUpperCase();
    return !['DRAFT', 'VOID', 'CANCELLED', 'CANCELED'].includes(status);
  });

  // Fetch total of all payments received
  const { data: paymentData, error: payError } = await supabase
    .from('payments')
    .select('amount')
    .eq('business_id', businessId);

  if (payError) {
    throw new Error(`[Reconciliation] Payments error: ${payError.message}`);
  }

  // Fetch AR account balance from the ledger (account code 1100 = Accounts Receivable)
  const { data: arAccount, error: arError } = await supabase
    .from('accounts')
    .select('id, ledger_entries ( amount, entry_type )')
    .eq('business_id', businessId)
    .eq('code', '1100')
    .single();

  const total_invoiced = round2(
    (invoiceData ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0)
  );

  const total_payments = round2(
    (paymentData ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  );

  const calculated_ar = round2(total_invoiced - total_payments);

  // Calculate ledger AR balance (debit normal balance account)
  let ledger_ar_balance = 0;
  if (!arError && arAccount) {
    const entries = (arAccount as any).ledger_entries ?? [];
    for (const entry of entries) {
      if (entry.entry_type === 'debit') {
        ledger_ar_balance += Number(entry.amount ?? 0);
      } else {
        ledger_ar_balance -= Number(entry.amount ?? 0);
      }
    }
    ledger_ar_balance = round2(ledger_ar_balance);
  }

  const delta = round2(Math.abs(calculated_ar - ledger_ar_balance));

  // Tolerance: within R0.01 is considered balanced (floating point safety)
  const is_balanced = delta < 0.01;

  return {
    is_balanced,
    total_invoiced,
    total_payments,
    calculated_ar,
    ledger_ar_balance,
    delta,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
