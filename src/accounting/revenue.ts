/**
 * Zande Accounting Engine v2 — Revenue Module
 *
 * Calculates revenue on an ACCRUAL basis.
 *
 * Rules:
 *  - Source: invoices table (NOT payments)
 *  - Date field: issue_date (P&L date)
 *  - Excluded statuses: DRAFT, VOID, CANCELLED
 *  - VAT is always separated from net revenue
 *  - Partial payments do NOT affect revenue recognition
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { supabase } from '../lib/supabase';
import type { Period, RevenueResult } from './types';

/**
 * Returns total revenue for a business within a given period.
 * Revenue is recognised at invoice issue_date (accrual accounting).
 *
 * @param businessId - The business UUID
 * @param period     - { dateFrom, dateTo } as ISO date strings (YYYY-MM-DD)
 */
export async function getRevenue(
  businessId: string,
  period: Period
): Promise<RevenueResult> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('business_id', businessId)
    .gte('issue_date', period.dateFrom)
    .lte('issue_date', period.dateTo);

  if (error) {
    throw new Error(`[Revenue] DB error: ${error.message}`);
  }

  // Filter in JS for maximum resilience to casing and nulls
  const rows = (data ?? []).filter(row => {
    const status = (row.status || 'SENT').toUpperCase();
    return !['DRAFT', 'VOID', 'CANCELLED'].includes(status);
  });

  let total_incl_vat = 0;
  let total_vat = 0;

  for (const row of rows) {
    const incl = Number(row.total || row.amount_due || 0);
    // vat_amount is stored on the invoice; if missing, derive from total - subtotal
    const vat = row.vat_amount != null
      ? Number(row.vat_amount)
      : incl - Number(row.subtotal ?? incl);

    total_incl_vat += incl;
    total_vat += vat;
  }

  const total_excl_vat = total_incl_vat - total_vat;

  return {
    total_excl_vat: round2(total_excl_vat),
    total_vat: round2(total_vat),
    total_incl_vat: round2(total_incl_vat),
    invoice_count: rows.length,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Rounds to 2 decimal places (currency precision). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
