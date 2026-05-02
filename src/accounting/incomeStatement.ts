/**
 * Zande Accounting Engine v2 — Income Statement Orchestrator
 *
 * Assembles the complete Income Statement from pure accounting functions.
 * This module contains NO raw database calls — it delegates to the
 * revenue and expenses modules and combines their outputs.
 *
 * Structure:
 *   Revenue (excl. VAT)
 *   - Operating Expenses (excl. VAT)
 *   = Net Profit
 *
 * Notes:
 *  - Cost of Goods Sold (COGS) is tracked as an expense category (COST_OF_SALES)
 *  - gross_profit = revenue (no COGS separation at top line yet)
 *  - All figures are on accrual basis (invoice date, not payment date)
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { getRevenue } from './revenue';
import { getExpenses } from './expenses';
import type { Period, IncomeStatement } from './types';

/**
 * Generates a complete Income Statement for a business and period.
 *
 * @param businessId - The business UUID
 * @param period     - { dateFrom, dateTo } as ISO date strings
 */
export async function generateIncomeStatement(
  businessId: string,
  period: Period
): Promise<IncomeStatement> {
  // Run revenue and expenses in parallel for performance
  const [revenue, expenses] = await Promise.all([
    getRevenue(businessId, period),
    getExpenses(businessId, period),
  ]);

  // Gross profit = Revenue excl. VAT (COGS would be subtracted here if separated)
  const gross_profit = round2(revenue.total_excl_vat);

  // Net profit = Revenue excl. VAT - Expenses excl. VAT
  const net_profit = round2(revenue.total_excl_vat - expenses.total_excl_vat);

  // Net margin percentage
  const margin_pct =
    revenue.total_excl_vat > 0
      ? round2((net_profit / revenue.total_excl_vat) * 100)
      : 0;

  return {
    period,
    revenue,
    expenses,
    gross_profit,
    net_profit,
    margin_pct,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
