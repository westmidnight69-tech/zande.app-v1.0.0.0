/**
 * Zande Reports — Excel Export
 *
 * Formats structured accounting data into XLSX workbooks.
 * Uses SheetJS (xlsx) library.
 *
 * Install: npm install xlsx
 *
 * Rules:
 *  - Accepts only structured data from the accounting layer
 *  - No raw DB calls
 *  - No UI side effects (triggers browser download directly)
 */

import * as XLSX from 'xlsx';
import type {
  IncomeStatement,
  VATResult,
  CashFlowResult,
  DebtorsAgingResult,
  ExpenseReportResult,
  InvoiceSummaryResult,
  ExecutiveSummaryResult
} from '../accounting/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): number {
  return Number(n.toFixed(2));
}

function saveWorkbook(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, filename);
}

// ─── Income Statement Excel ───────────────────────────────────────────────────

export function exportIncomeStatementXLSX(
  data: IncomeStatement,
  businessName = 'Business'
): void {
  const rows: any[] = [
    ['Zande — Income Statement', '', ''],
    [businessName, '', ''],
    [`Period: ${data.period.dateFrom} to ${data.period.dateTo}`, '', ''],
    ['', '', ''],
    ['REVENUE', '', ''],
    ['Revenue (excl. VAT)', '', fmt(data.revenue.total_excl_vat)],
    ['Output VAT', '', fmt(data.revenue.total_vat)],
    ['Revenue (incl. VAT)', '', fmt(data.revenue.total_incl_vat)],
    ['Number of Invoices', '', data.revenue.invoice_count],
    ['', '', ''],
    ['OPERATING EXPENSES', '', ''],
    ...Object.entries(data.expenses.by_category).map(([cat, amount]) => [
      `  ${cat.replace(/_/g, ' ')}`,
      '',
      fmt(amount),
    ]),
    ['Total Expenses (excl. VAT)', '', fmt(data.expenses.total_excl_vat)],
    ['Input VAT on Expenses', '', fmt(data.expenses.total_vat)],
    ['', '', ''],
    ['PROFIT', '', ''],
    ['Gross Profit', '', fmt(data.gross_profit)],
    ['Net Profit', '', fmt(data.net_profit)],
    ['Net Margin (%)', '', fmt(data.margin_pct)],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 5 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Income Statement');

  saveWorkbook(wb, `income-statement-${data.period.dateFrom}.xlsx`);
}

// ─── VAT Report Excel ─────────────────────────────────────────────────────────

export function exportVATReportXLSX(data: VATResult, businessName = 'Business'): void {
  const isRefund = data.vat_payable < 0;

  const rows: any[] = [
    ['Zande — VAT Report (VAT201)', '', ''],
    [businessName, '', ''],
    [`Period: ${data.period.dateFrom} to ${data.period.dateTo}`, '', ''],
    ['', '', ''],
    ['Output VAT (Sales)', '', fmt(data.output_vat)],
    ['Input VAT (Claimable Expenses)', '', fmt(data.input_vat)],
    ['', '', ''],
    [isRefund ? 'VAT Refund Due from SARS' : 'VAT Payable to SARS', '', fmt(Math.abs(data.vat_payable))],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 5 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'VAT Report');

  saveWorkbook(wb, `vat-report-${data.period.dateFrom}.xlsx`);
}

// ─── Aged Debtors Excel ───────────────────────────────────────────────────────

export function exportDebtorsAgingXLSX(
  data: DebtorsAgingResult,
  businessName = 'Business'
): void {
  const header = [
    'Invoice #', 'Client', 'Issue Date', 'Due Date',
    'Invoice Total', 'Payments Applied', 'Outstanding',
    'Days Outstanding', 'Bucket',
  ];

  const dataRows = data.lines.map((line) => [
    line.invoice_number,
    line.client_name,
    line.issue_date,
    line.due_date,
    fmt(line.invoice_total),
    fmt(line.payments_applied),
    fmt(line.outstanding),
    line.days_outstanding,
    line.bucket,
  ]);

  const summaryRows: any[] = [
    [],
    ['BUCKET SUMMARY', '', ''],
    ['Current (0–30 days)', '', fmt(data.totals.current)],
    ['31–60 days', '', fmt(data.totals['31-60'])],
    ['61–90 days', '', fmt(data.totals['61-90'])],
    ['90+ days (Critical)', '', fmt(data.totals['90+'])],
    ['TOTAL OUTSTANDING', '', fmt(data.totals.total_outstanding)],
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    [`Zande — Aged Debtors as at ${data.as_of_date}`],
    [businessName],
    [],
    header,
    ...dataRows,
    ...summaryRows,
  ]);

  ws['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Aged Debtors');

  saveWorkbook(wb, `debtors-aging-${data.as_of_date}.xlsx`);
}

// ─── Cash Flow Excel ──────────────────────────────────────────────────────────

export function exportCashFlowXLSX(data: CashFlowResult, businessName = 'Business'): void {
  const rows: any[] = [
    ['Zande — Cash Flow Statement', '', ''],
    [businessName, '', ''],
    [`Period: ${data.period.dateFrom} to ${data.period.dateTo}`, '', ''],
    ['', '', ''],
    ['Opening Balance', '', fmt(data.opening_balance)],
    ['Cash In (Payments Received)', '', fmt(data.cash_in)],
    ['Cash Out (Expenses Paid)', '', fmt(data.cash_out)],
    ['', '', ''],
    ['Net Movement', '', fmt(data.net_movement)],
    ['Closing Balance', '', fmt(data.closing_balance)],
    ['', '', ''],
    ['Note: Bank API integration for live feed data is planned.', '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 5 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cash Flow');

  saveWorkbook(wb, `cashflow-${data.period.dateFrom}.xlsx`);
}

// ─── Expense Report Excel ─────────────────────────────────────────────────────

export function exportExpenseReportXLSX(data: ExpenseReportResult, businessName = 'Business'): void {
  const header = ['Date', 'Merchant', 'Category', 'Description', 'Net', 'VAT', 'Gross'];

  const dataRows = data.lines.map(line => [
    line.expense_date,
    line.merchant,
    line.category.replace(/_/g, ' '),
    line.description,
    fmt(line.net_amount),
    fmt(line.vat_amount),
    fmt(line.amount)
  ]);

  const summaryHeader = ['Category', 'Count', 'Net', 'VAT', 'Gross'];
  const summaryRows = Object.entries(data.by_category).map(([cat, totals]) => [
    cat.replace(/_/g, ' '),
    totals.count,
    fmt(totals.net),
    fmt(totals.vat),
    fmt(totals.gross)
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    ['Zande — Expense Report'],
    [businessName],
    [`Period: ${data.period.dateFrom} to ${data.period.dateTo}`],
    [],
    header,
    ...dataRows,
    [],
    ['SUBTOTALS BY CATEGORY'],
    summaryHeader,
    ...summaryRows,
    [],
    ['TOTAL EXPENSES (GROSS)', '', '', '', '', '', fmt(data.totals.total_gross)]
  ]);

  ws['!cols'] = [
    { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 30 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

  saveWorkbook(wb, `expense-report-${data.period.dateFrom}.xlsx`);
}

// ─── Invoice Summary Excel ────────────────────────────────────────────────────

export function exportInvoiceSummaryXLSX(data: InvoiceSummaryResult, businessName = 'Business'): void {
  const header = ['Invoice #', 'Client', 'Issue Date', 'Status', 'Total', 'Paid', 'Outstanding'];

  const dataRows = data.lines.map(line => [
    line.invoice_number,
    line.client_name,
    line.issue_date,
    line.status,
    fmt(line.total),
    fmt(line.total - line.amount_due),
    fmt(line.amount_due)
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    ['Zande — Invoice Summary'],
    [businessName],
    [`Period: ${data.period.dateFrom} to ${data.period.dateTo}`],
    [],
    header,
    ...dataRows,
    [],
    ['TOTAL INVOICED', '', '', '', fmt(data.totals.total_invoiced)],
    ['TOTAL OUTSTANDING', '', '', '', '', '', fmt(data.totals.total_outstanding)]
  ]);

  ws['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 14 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

  saveWorkbook(wb, `invoice-summary-${data.period.dateFrom}.xlsx`);
}

// ─── Executive Summary Excel ──────────────────────────────────────────────────

export function exportExecutiveSummaryXLSX(data: ExecutiveSummaryResult): void {
  const isRefund = data.vat.vat_payable < 0;

  const rows: any[] = [
    ['Zande — Executive Dashboard Summary', '', ''],
    [data.business_name, '', ''],
    [`Period: ${data.period.dateFrom} to ${data.period.dateTo}`, '', ''],
    ['', '', ''],
    ['KEY METRICS', '', ''],
    ['Total Revenue (excl. VAT)', '', fmt(data.revenue.total_excl_vat)],
    ['Total Expenses (excl. VAT)', '', fmt(data.expenses.total_excl_vat)],
    ['Net Profit', '', fmt(data.net_profit)],
    ['Net Margin (%)', '', fmt(data.margin_pct)],
    ['', '', ''],
    ['CASH & DEBTORS', '', ''],
    ['Net Cash Movement', '', fmt(data.cash_flow.net_movement)],
    ['Closing Bank Balance', '', fmt(data.cash_flow.closing_balance)],
    ['Total Debtors Outstanding', '', fmt(data.debtors_total)],
    ['', '', ''],
    ['VAT & ACTIVITY', '', ''],
    [isRefund ? 'VAT Refund Due' : 'VAT Payable', '', fmt(Math.abs(data.vat.vat_payable))],
    ['Invoices Issued', '', data.invoice_count],
    ['', '', ''],
    ['TOP 5 EXPENSES', '', ''],
    ...data.top_expense_categories.map(([cat, amount]) => [
      cat.replace(/_/g, ' '), '', fmt(amount)
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 5 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Executive Summary');

  saveWorkbook(wb, `executive-summary-${data.period.dateFrom}.xlsx`);
}
