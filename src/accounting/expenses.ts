/**
 * Zande Accounting Engine v2 — Expenses Module
 *
 * Calculates business expenses within a period.
 *
 * Rules:
 *  - Source: expenses table
 *  - Date field: expense_date
 *  - VAT is always separated (vat_amount stored at write time)
 *  - All active expense categories are included
 *  - Results broken down by category for reporting
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { supabase } from '../lib/supabase';
import type { Period, ExpenseResult } from './types';

/**
 * Returns total expenses for a business within a given period.
 * Categorised breakdown is always included.
 *
 * @param businessId - The business UUID
 * @param period     - { dateFrom, dateTo } as ISO date strings (YYYY-MM-DD)
 */
export async function getExpenses(
  businessId: string,
  period: Period
): Promise<ExpenseResult> {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount, vat_amount, net_amount, category')
    .eq('business_id', businessId)
    .gte('expense_date', period.dateFrom)
    .lte('expense_date', period.dateTo);

  if (error) {
    throw new Error(`[Expenses] DB error: ${error.message}`);
  }

  const rows = data ?? [];

  let total_incl_vat = 0;
  let total_vat = 0;
  const by_category: Record<string, number> = {};

  for (const row of rows) {
    const incl = Number(row.amount ?? 0);
    // Use stored vat_amount if available; otherwise 0
    const vat = Number(row.vat_amount ?? 0);
    const net = row.net_amount != null ? Number(row.net_amount) : incl - vat;
    const category = row.category ?? 'OTHER';

    total_incl_vat += incl;
    total_vat += vat;

    // Categorise by net (excl. VAT) amount
    by_category[category] = round2((by_category[category] ?? 0) + net);
  }

  const total_excl_vat = total_incl_vat - total_vat;

  return {
    total_excl_vat: round2(total_excl_vat),
    total_vat: round2(total_vat),
    total_incl_vat: round2(total_incl_vat),
    by_category,
    expense_count: rows.length,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
