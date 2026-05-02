/**
 * Zande Accounting Engine v3 — Expense Report Module (Detailed)
 *
 * Produces a line-by-line expense listing grouped by category.
 * This is distinct from the aggregate getExpenses() which only returns totals.
 *
 * Rules:
 *  - Source: expenses table
 *  - Date field: expense_date within period
 *  - Returns every expense with merchant, description, category, amounts
 *  - Grouped by category with subtotals
 *  - Sorted by date descending within each category
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { supabase } from '../lib/supabase';
import type { Period, ExpenseReportLine, ExpenseReportResult } from './types';

/**
 * Returns a detailed expense listing for a business within a given period.
 *
 * @param businessId - The business UUID
 * @param period     - { dateFrom, dateTo } as ISO date strings (YYYY-MM-DD)
 */
export async function getExpenseReport(
  businessId: string,
  period: Period
): Promise<ExpenseReportResult> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('business_id', businessId)
    .gte('expense_date', period.dateFrom)
    .lte('expense_date', period.dateTo)
    .order('expense_date', { ascending: false });

  if (error) {
    throw new Error(`[ExpenseReport] DB error: ${error.message}`);
  }

  const rows = data ?? [];
  const lines: ExpenseReportLine[] = [];

  const by_category: Record<string, { net: number; vat: number; gross: number; count: number }> = {};

  let total_gross = 0;
  let total_vat = 0;
  let total_net = 0;

  for (const row of rows) {
    const gross = Number(row.amount ?? 0);
    const vat = Number(row.vat_amount ?? 0);
    const net = row.net_amount != null ? Number(row.net_amount) : gross - vat;
    const category = row.category ?? 'OTHER';

    total_gross += gross;
    total_vat += vat;
    total_net += net;

    // Build category subtotals
    if (!by_category[category]) {
      by_category[category] = { net: 0, vat: 0, gross: 0, count: 0 };
    }
    by_category[category].net = round2(by_category[category].net + net);
    by_category[category].vat = round2(by_category[category].vat + vat);
    by_category[category].gross = round2(by_category[category].gross + gross);
    by_category[category].count += 1;

    lines.push({
      expense_id: row.id,
      expense_date: row.expense_date,
      category,
      merchant: row.merchant ?? '',
      description: row.description ?? '',
      amount: round2(gross),
      vat_amount: round2(vat),
      net_amount: round2(net),
    });
  }

  return {
    period,
    lines,
    by_category,
    totals: {
      total_gross: round2(total_gross),
      total_vat: round2(total_vat),
      total_net: round2(total_net),
      expense_count: lines.length,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
