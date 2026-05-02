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
  // Fetch invoices where the relevant VAT date falls within the period.
  // We use COALESCE logic by fetching both columns and handling it in JS,
  // since Supabase JS client does not support COALESCE in .select().
  const { data, error } = await supabase
    .from('invoices')
    .select('vat_amount, tax_point_date, issue_date')
    .eq('business_id', businessId)
    .not('status', 'in', '("DRAFT","VOID","CANCELLED")');

  if (error) {
    throw new Error(`[VAT Output] DB error: ${error.message}`);
  }

  const rows = data ?? [];
  let output_vat = 0;

  for (const row of rows) {
    // Use tax_point_date if available, otherwise fall back to issue_date
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
    .select('vat_amount')
    .eq('business_id', businessId)
    .eq('vat_claimable', true)
    .gte('expense_date', period.dateFrom)
    .lte('expense_date', period.dateTo);

  if (error) {
    throw new Error(`[VAT Input] DB error: ${error.message}`);
  }

  const rows = data ?? [];
  const input_vat = rows.reduce((sum, row) => sum + Number(row.vat_amount ?? 0), 0);

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
