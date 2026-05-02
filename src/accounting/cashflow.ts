/**
 * Zande Accounting Engine v2 — Cash Flow Module
 *
 * Calculates real cash movements on a CASH basis (not accrual).
 *
 * Rules:
 *  - Cash IN:  payments received from clients (payments table, payment_date)
 *  - Cash OUT: expenses paid (expenses table, expense_date)
 *  - Opening balance: provided as a parameter (bank API planned for future)
 *  - This module never uses invoice data — only actual cash movements
 *  - Revenue ≠ Cash In (invoiced but unpaid invoices are NOT included)
 *
 * Bank API integration note:
 *  The BankAccounts feature is planned to pull live balances via banking APIs.
 *  Until that integration is live, opening_balance must be provided manually.
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { supabase } from '../lib/supabase';
import type { Period, CashFlowResult } from './types';

/**
 * Returns total cash received from clients in a period.
 * Source: payments table using payment_date.
 * Note: This is CASH received, not invoiced revenue.
 */
export async function getCashIn(
  businessId: string,
  period: Period
): Promise<number> {
  const { data, error } = await supabase
    .from('payments')
    .select('amount')
    .eq('business_id', businessId)
    .gte('payment_date', period.dateFrom)
    .lte('payment_date', period.dateTo);

  if (error) {
    throw new Error(`[CashFlow] getCashIn DB error: ${error.message}`);
  }

  const rows = data ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  return round2(total);
}

/**
 * Returns total cash paid out in a period.
 * Source: expenses table using expense_date.
 * Cash out = money actually spent, tracked through expenses.
 *
 * Note: Bank API integration will enhance this with direct bank feed data
 * in a future release (BankAccounts page — Coming Soon).
 */
export async function getCashOut(
  businessId: string,
  period: Period
): Promise<number> {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount')
    .eq('business_id', businessId)
    .gte('expense_date', period.dateFrom)
    .lte('expense_date', period.dateTo);

  if (error) {
    throw new Error(`[CashFlow] getCashOut DB error: ${error.message}`);
  }

  const rows = data ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  return round2(total);
}

/**
 * Builds a complete cash flow statement for a period.
 *
 * @param businessId     - The business UUID
 * @param period         - { dateFrom, dateTo }
 * @param openingBalance - Manual opening balance (defaults to 0 until bank API is live)
 */
export async function buildCashFlowStatement(
  businessId: string,
  period: Period,
  openingBalance = 0
): Promise<CashFlowResult> {
  const [cash_in, cash_out] = await Promise.all([
    getCashIn(businessId, period),
    getCashOut(businessId, period),
  ]);

  const net_movement = round2(cash_in - cash_out);
  const closing_balance = round2(openingBalance + net_movement);

  return {
    opening_balance: round2(openingBalance),
    cash_in,
    cash_out,
    net_movement,
    closing_balance,
    period,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
