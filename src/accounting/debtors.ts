/**
 * Zande Accounting Engine v2 — Aged Debtors Module
 *
 * Calculates how much each client owes and for how long.
 *
 * Rules:
 *  - Source: invoices + payments tables
 *  - Only includes invoices with outstanding balance > 0
 *  - Excluded statuses: DRAFT, VOID, CANCELLED
 *  - outstanding = invoice.total - SUM(payments linked to this invoice)
 *  - days_outstanding = asOfDate - invoice.due_date
 *  - Buckets: current (0-30), 31-60, 61-90, 90+ days past due
 *  - Current bucket includes invoices not yet past due (negative days)
 *
 * This is the most common failure point in accounting systems.
 * Partial payments are fully handled here.
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { supabase } from '../lib/supabase';
import type { DebtorBucket, DebtorLine, DebtorsAgingResult } from './types';

/**
 * Returns the aged debtors listing as of a specific date.
 *
 * @param businessId - The business UUID
 * @param asOfDate   - Reference date for aging calculation (ISO: 'YYYY-MM-DD')
 */
export async function getDebtorsAging(
  businessId: string,
  asOfDate: string
): Promise<DebtorsAgingResult> {
  // Fetch all outstanding invoices with client names
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      issue_date,
      due_date,
      total,
      status,
      clients ( name )
    `)
    .eq('business_id', businessId)
    .not('status', 'in', '("DRAFT","VOID","CANCELLED")');

  if (invError) {
    throw new Error(`[Debtors] Invoices DB error: ${invError.message}`);
  }

  // Fetch all payments for this business (to calculate amounts applied per invoice)
  const { data: payments, error: payError } = await supabase
    .from('payments')
    .select('invoice_id, amount')
    .eq('business_id', businessId)
    .not('invoice_id', 'is', null);

  if (payError) {
    throw new Error(`[Debtors] Payments DB error: ${payError.message}`);
  }

  // Build a map of payments applied per invoice
  const paymentsApplied: Record<string, number> = {};
  for (const p of payments ?? []) {
    if (!p.invoice_id) continue;
    paymentsApplied[p.invoice_id] = round2(
      (paymentsApplied[p.invoice_id] ?? 0) + Number(p.amount ?? 0)
    );
  }

  const today = new Date(asOfDate);
  const lines: DebtorLine[] = [];

  for (const inv of invoices ?? []) {
    const invoiceTotal = Number(inv.total ?? 0);
    const applied = paymentsApplied[inv.id] ?? 0;
    const outstanding = round2(invoiceTotal - applied);

    // Skip fully paid invoices
    if (outstanding <= 0) continue;

    // Calculate days past due (positive = overdue, negative = not yet due)
    const dueDate = new Date(inv.due_date ?? inv.issue_date);
    const daysOutstanding = Math.floor(
      (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const bucket = agingBucket(daysOutstanding);
    const clientName =
      (inv.clients as any)?.name ?? 'Unknown Client';

    lines.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      client_name: clientName,
      issue_date: inv.issue_date,
      due_date: inv.due_date ?? inv.issue_date,
      invoice_total: invoiceTotal,
      payments_applied: applied,
      outstanding,
      days_outstanding: daysOutstanding,
      bucket,
    });
  }

  // Sort by days outstanding descending (most overdue first)
  lines.sort((a, b) => b.days_outstanding - a.days_outstanding);

  // Calculate bucket totals
  const totals = {
    current: 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
    total_outstanding: 0,
  };

  for (const line of lines) {
    totals[line.bucket] = round2(totals[line.bucket] + line.outstanding);
    totals.total_outstanding = round2(totals.total_outstanding + line.outstanding);
  }

  return {
    as_of_date: asOfDate,
    lines,
    totals,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Maps days outstanding to the correct aging bucket.
 * Invoices not yet past due fall into 'current'.
 */
function agingBucket(days: number): DebtorBucket {
  if (days <= 30) return 'current';   // Includes not-yet-due (negative days)
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
