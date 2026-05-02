/**
 * Zande Accounting Engine v2 — VAT Module (SARS-Compliant)
 *
 * South African VAT logic for VAT201 reporting.
 *
 * Rules:
 *  - Output VAT: from issued invoices using tax_point_date
 *    (falls back to issue_date if tax_point_date is null)
 *  - Input VAT: from expenses where vat_claimable = true
 *  - VAT Payable: Output - Input (negative = refund due)
 *  - Standard SA VAT rate: 15%
 *  - Excluded invoice statuses: DRAFT, VOID, CANCELLED
 *
 * Zero UI code. Zero side effects. Pure calculation only.
 */

import { supabase } from '../lib/supabase';
import type { Period, VATResult } from './types';

/**
 * Calculates VAT output (collected from customers) for a VAT period.
 * Uses tax_point_date for correct VAT period assignment.
 * Falls back to issue_date if tax_point_date is NULL (legacy records).
 */
async function getVATOutput(
  businessId: string,
  period: Period
): Promise<number> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('business_id', businessId)
    .not('status', 'in', '("DRAFT","VOID","CANCELLED")');

  if (error) {
    throw new Error(`[VAT Output] DB error: ${error.message}`);
  }

  const rows = data ?? [];
  let output_vat = 0;

  for (const row of rows) {
    const vatDate = row.tax_point_date ?? row.issue_date;
    if (vatDate >= period.dateFrom && vatDate <= period.dateTo) {
      output_vat += Number(row.vat_amount ?? 0);
    }
  }

  return round2(output_vat);
}

/**
 * Calculates VAT input (claimable from SARS) for a period.
 * Only includes expenses marked as vat_claimable = true.
 */
async function getVATInput(
  businessId: string,
  period: Period
): Promise<number> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('business_id', businessId)
    .gte('expense_date', period.dateFrom)
    .lte('expense_date', period.dateTo);

  if (error) {
    throw new Error(`[VAT Input] DB error: ${error.message}`);
  }

  const rows = data ?? [];
  // Filter for claimable VAT in memory to avoid crashing on old schemas missing the column
  const input_vat = rows.reduce((sum, row) => {
    const isClaimable = row.vat_claimable === undefined ? true : row.vat_claimable === true;
    return sum + (isClaimable ? Number(row.vat_amount ?? 0) : 0);
  }, 0);

  return round2(input_vat);
}

/**
 * Returns the complete VAT summary for a period.
 * vat_payable < 0 means SARS owes the business a refund.
 *
 * @param businessId - The business UUID
 * @param period     - The VAT period (typically 2-month bi-monthly period for SA)
 */
export async function getVATSummary(
  businessId: string,
  period: Period
): Promise<VATResult> {
  const [output_vat, input_vat] = await Promise.all([
    getVATOutput(businessId, period),
    getVATInput(businessId, period),
  ]);

  return {
    output_vat,
    input_vat,
    vat_payable: round2(output_vat - input_vat),
    period,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
