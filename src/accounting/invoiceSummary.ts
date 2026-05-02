/**
 * Zande Accounting Engine v3 — Invoice Summary Module
 *
 * Produces a complete invoice listing for a period with status breakdown.
 *
 * Rules:
 *  - Source: invoices table joined with clients (name)
 *  - Date field: issue_date within period
 *  - Excluded statuses: VOID, CANCELLED (but DRAFT is included for visibility)
 *  - Returns every invoice with its current status and outstanding amount
 *  - Totals include: total_invoiced, total_outstanding, total_paid, by_status count
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { supabase } from '../lib/supabase';
import type { Period, InvoiceSummaryLine, InvoiceSummaryResult } from './types';

/**
 * Returns a full invoice listing for a business within a given period.
 *
 * @param businessId - The business UUID
 * @param period     - { dateFrom, dateTo } as ISO date strings (YYYY-MM-DD)
 */
export async function getInvoiceSummary(
  businessId: string,
  period: Period
): Promise<InvoiceSummaryResult> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients(name)')
    .eq('business_id', businessId)
    .gte('issue_date', period.dateFrom)
    .lte('issue_date', period.dateTo)
    .order('issue_date', { ascending: false });

  if (error) {
    throw new Error(`[InvoiceSummary] DB error: ${error.message}`);
  }

  // Filter in JS for maximum resilience to casing and nulls
  const rows = (data ?? []).filter(row => {
    const status = (row.status || '').toUpperCase();
    return !['VOID', 'CANCELLED'].includes(status);
  });
  const lines: InvoiceSummaryLine[] = [];

  let total_invoiced = 0;
  let total_outstanding = 0;
  const by_status: Record<string, number> = {};

  for (const row of rows) {
    const total = Number(row.total ?? 0);
    const amountDue = Number(row.amount_due ?? 0);
    const status = row.status ?? 'UNKNOWN';
    const clientName = (row.clients as any)?.name ?? 'Unknown Client';

    total_invoiced += total;
    total_outstanding += amountDue;
    by_status[status] = (by_status[status] ?? 0) + 1;

    lines.push({
      invoice_id: row.id,
      invoice_number: row.invoice_number,
      client_name: clientName,
      issue_date: row.issue_date,
      due_date: row.due_date ?? row.issue_date,
      total: round2(total),
      amount_due: round2(amountDue),
      status,
    });
  }

  return {
    period,
    lines,
    totals: {
      total_invoiced: round2(total_invoiced),
      total_outstanding: round2(total_outstanding),
      total_paid: round2(total_invoiced - total_outstanding),
      invoice_count: lines.length,
      by_status,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
