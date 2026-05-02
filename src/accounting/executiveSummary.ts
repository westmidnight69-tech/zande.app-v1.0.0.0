/**
 * Zande Accounting Engine v3 — Executive Summary Module
 *
 * Orchestrator that assembles a one-page KPI snapshot by delegating
 * to all other accounting modules. Contains NO raw database calls.
 *
 * Output:
 *  - Revenue + Expenses + Net Profit + Margin
 *  - Cash position (opening → closing)
 *  - VAT liability / refund
 *  - Total debtors outstanding
 *  - Invoice count for the period
 *  - Top 5 expense categories
 *
 * Zero UI code. Zero side effects. Pure delegation only.
 */

import { generateIncomeStatement } from './incomeStatement';
import { buildCashFlowStatement } from './cashflow';
import { getVATSummary } from './vat';
import { getDebtorsAging } from './debtors';
import { getRevenue } from './revenue';
import type { Period, ExecutiveSummaryResult } from './types';

/**
 * Generates a complete executive summary for a business and period.
 * Runs all sub-reports in parallel for performance.
 *
 * @param businessId   - The business UUID
 * @param period       - { dateFrom, dateTo } as ISO date strings
 * @param businessName - Human-readable business name for the report header
 * @param openingBalance - Manual opening cash balance (defaults to 0)
 */
export async function generateExecutiveSummary(
  businessId: string,
  period: Period,
  businessName = 'Your Business',
  openingBalance = 0
): Promise<ExecutiveSummaryResult> {
  // Run all reports in parallel
  const [incomeStmt, cashFlow, vat, debtors, revenue] = await Promise.all([
    generateIncomeStatement(businessId, period),
    buildCashFlowStatement(businessId, period, openingBalance),
    getVATSummary(businessId, period),
    getDebtorsAging(businessId, period.dateTo),
    getRevenue(businessId, period),
  ]);

  // Extract top 5 expense categories by net amount (descending)
  const sortedCategories = Object.entries(incomeStmt.expenses.by_category)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5) as [string, number][];

  return {
    period,
    business_name: businessName,
    revenue: incomeStmt.revenue,
    expenses: incomeStmt.expenses,
    net_profit: incomeStmt.net_profit,
    margin_pct: incomeStmt.margin_pct,
    cash_flow: cashFlow,
    vat,
    debtors_total: debtors.totals.total_outstanding,
    invoice_count: revenue.invoice_count,
    top_expense_categories: sortedCategories,
  };
}
