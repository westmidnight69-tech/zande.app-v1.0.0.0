/**
 * Zande Accounting Engine v2 — Shared Types
 *
 * These types define the input/output contracts for every pure function
 * in the accounting layer. No UI code, no formatting, no side effects.
 */

// ─── Period ──────────────────────────────────────────────────────────────────

export interface Period {
  /** ISO date string: 'YYYY-MM-DD' */
  dateFrom: string;
  /** ISO date string: 'YYYY-MM-DD' */
  dateTo: string;
}

// ─── Revenue ─────────────────────────────────────────────────────────────────

export interface RevenueResult {
  /** Total revenue excluding VAT (accrual basis) */
  total_excl_vat: number;
  /** Total VAT charged on issued invoices */
  total_vat: number;
  /** Total revenue including VAT */
  total_incl_vat: number;
  /** Number of invoices included */
  invoice_count: number;
}

// ─── Expenses ────────────────────────────────────────────────────────────────

export interface ExpenseResult {
  /** Total expenses excluding VAT */
  total_excl_vat: number;
  /** Total input VAT on expenses */
  total_vat: number;
  /** Total expenses including VAT */
  total_incl_vat: number;
  /** Breakdown by category: { RENT: 1500, SALARIES: 20000, ... } */
  by_category: Record<string, number>;
  /** Number of expense records included */
  expense_count: number;
}

// ─── VAT ─────────────────────────────────────────────────────────────────────

export interface VATResult {
  /** VAT collected from customers (sales invoices) */
  output_vat: number;
  /** VAT paid on business expenses (claimable only) */
  input_vat: number;
  /**
   * Net VAT payable to SARS.
   * Positive = you owe SARS.
   * Negative = SARS owes you a refund.
   */
  vat_payable: number;
  /** Period this VAT result covers */
  period: Period;
}

// ─── Cash Flow ───────────────────────────────────────────────────────────────

export interface CashFlowResult {
  /** Opening bank balance (manual or carried forward) */
  opening_balance: number;
  /** Total cash received from clients in period (payments table) */
  cash_in: number;
  /**
   * Total cash paid out in period.
   * Source: expenses table (expense_date in period).
   * Note: Bank API integration is planned for future release.
   */
  cash_out: number;
  /** Net movement: cash_in - cash_out */
  net_movement: number;
  /** Closing balance: opening + net_movement */
  closing_balance: number;
  /** Period covered */
  period: Period;
}

// ─── Aged Debtors ────────────────────────────────────────────────────────────

export type DebtorBucket = 'current' | '31-60' | '61-90' | '90+';

export interface DebtorLine {
  invoice_id: string;
  invoice_number: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  /** Original invoice total (incl. VAT) */
  invoice_total: number;
  /** Sum of all payments applied to this invoice */
  payments_applied: number;
  /** invoice_total - payments_applied */
  outstanding: number;
  /** today - due_date in days (negative = not yet due) */
  days_outstanding: number;
  /** Age bucket for this debtor line */
  bucket: DebtorBucket;
}

export interface DebtorsAgingResult {
  as_of_date: string;
  lines: DebtorLine[];
  totals: {
    current: number;
    '31-60': number;
    '61-90': number;
    '90+': number;
    total_outstanding: number;
  };
}

// ─── Income Statement ────────────────────────────────────────────────────────

export interface IncomeStatement {
  period: Period;
  revenue: RevenueResult;
  expenses: ExpenseResult;
  /** Revenue excl. VAT (no COGS separation yet) */
  gross_profit: number;
  /** gross_profit - expenses excl. VAT */
  net_profit: number;
  /** net_profit / revenue * 100 */
  margin_pct: number;
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

export interface ReconciliationResult {
  /** true = system is balanced */
  is_balanced: boolean;
  /** Total of all non-void, non-draft invoices */
  total_invoiced: number;
  /** Total of all payments received */
  total_payments: number;
  /** Calculated AR = invoiced - payments */
  calculated_ar: number;
  /**
   * Difference between calculated AR and ledger AR balance.
   * Should be 0. Non-zero means data integrity issue.
   */
  ledger_ar_balance: number;
  delta: number;
}

// ─── Invoice Summary ─────────────────────────────────────────────────────────

export interface InvoiceSummaryLine {
  invoice_id: string;
  invoice_number: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  /** Invoice total (incl. VAT) */
  total: number;
  /** Remaining amount due */
  amount_due: number;
  /** Current status: SENT, PAID, OVERDUE, PARTIAL, etc. */
  status: string;
}

export interface InvoiceSummaryResult {
  period: Period;
  lines: InvoiceSummaryLine[];
  totals: {
    /** Sum of all invoice totals */
    total_invoiced: number;
    /** Sum of all remaining amount_due */
    total_outstanding: number;
    /** total_invoiced - total_outstanding */
    total_paid: number;
    /** Number of invoices */
    invoice_count: number;
    /** Count per status: { PAID: 5, SENT: 3, OVERDUE: 2, ... } */
    by_status: Record<string, number>;
  };
}

// ─── Expense Report (Detailed) ───────────────────────────────────────────────

export interface ExpenseReportLine {
  expense_id: string;
  expense_date: string;
  category: string;
  /** Vendor / merchant / supplier name */
  merchant: string;
  description: string;
  /** Total amount (incl. VAT) */
  amount: number;
  /** VAT component */
  vat_amount: number;
  /** Net amount (excl. VAT) */
  net_amount: number;
}

export interface ExpenseReportResult {
  period: Period;
  lines: ExpenseReportLine[];
  /** Category subtotals: { RENT: { net: 1500, vat: 225, gross: 1725, count: 1 }, ... } */
  by_category: Record<string, {
    net: number;
    vat: number;
    gross: number;
    count: number;
  }>;
  totals: {
    total_gross: number;
    total_vat: number;
    total_net: number;
    expense_count: number;
  };
}

// ─── Executive Summary ───────────────────────────────────────────────────────

export interface ExecutiveSummaryResult {
  period: Period;
  business_name: string;
  /** Core P&L metrics */
  revenue: RevenueResult;
  expenses: ExpenseResult;
  net_profit: number;
  margin_pct: number;
  /** Cash position */
  cash_flow: CashFlowResult;
  /** VAT liability / refund */
  vat: VATResult;
  /** Total outstanding from debtors */
  debtors_total: number;
  /** Total invoices issued in period */
  invoice_count: number;
  /** Top 5 expense categories: [['RENT', 1500], ['SALARIES', 20000], ...] */
  top_expense_categories: [string, number][];
}
