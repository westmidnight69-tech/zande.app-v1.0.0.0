import { supabase } from '../lib/supabase';
import { postingEngine } from './postingEngine';
import { parseXlsxStatement } from './extractors/xlsxExtractor';
import { parseCsvStatement } from './extractors/csvExtractor';
import { parsePdfStatement } from './extractors/pdfExtractor';
import type { ExtractedStatement } from './extractors/types';
import { normalizeTransaction } from './normalizationEngine';
import type { NormalizedTransaction } from './normalizationEngine';
import { detectDuplicates } from './duplicateDetection';

export interface MatchSuggestion {
  bankTransactionId: string;
  sourceType: 'invoice' | 'expense' | 'payment' | 'journal';
  sourceId: string;
  confidence: number;
  matchReason: string;
}

export async function processStatementFile(file: File, businessId: string, bankAccountId: string) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  let extracted: ExtractedStatement;
  if (ext === 'pdf') {
    extracted = await parsePdfStatement(file);
  } else if (ext === 'csv') {
    extracted = await parseCsvStatement(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    extracted = await parseXlsxStatement(file);
  } else {
    throw new Error('Unsupported file format.');
  }

  const normalizedTxs: NormalizedTransaction[] = [];
  for (const raw of extracted.rows) {
    const norm = await normalizeTransaction(bankAccountId, raw);
    normalizedTxs.push(norm);
  }

  const { clean, duplicates, flagged } = await detectDuplicates(businessId, bankAccountId, normalizedTxs);

  return {
    statementData: {
      startDate: extracted.startDate,
      endDate: extracted.endDate,
      openingBalance: extracted.openingBalance,
      closingBalance: extracted.closingBalance
    },
    clean,
    duplicates,
    flagged
  };
}

function textSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const str1 = s1.toLowerCase();
  const str2 = s2.toLowerCase();
  if (str1 === str2) return 1;

  const w1 = new Set(str1.split(/[\s,.\-_/]+/));
  const w2 = new Set(str2.split(/[\s,.\-_/]+/));

  let matches = 0;
  w1.forEach(word => {
    if (word.length > 2 && w2.has(word)) {
      matches++;
    }
  });

  return matches / Math.max(w1.size, w2.size);
}

export async function matchBankTransactions(
  businessId: string,
  bankTransactionIds: string[]
): Promise<MatchSuggestion[]> {
  const suggestions: MatchSuggestion[] = [];

  const { data: bankTxs } = await supabase
    .from('bank_transactions')
    .select('*')
    .in('id', bankTransactionIds)
    .eq('reconciliation_status', 'unmatched');

  if (!bankTxs || bankTxs.length === 0) return [];

  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('*, clients(name)')
    .eq('business_id', businessId)
    .in('status', ['sent', 'partially_paid']);

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('business_id', businessId);
    
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('business_id', businessId);

  for (const tx of bankTxs) {
    let bestMatch: MatchSuggestion | null = null;

    if (payments) {
      for (const p of payments) {
        if (Math.abs(Number(p.amount) - Number(tx.amount)) < 0.01) {
          const diffDays = Math.abs(new Date(tx.transaction_date).getTime() - new Date(p.payment_date).getTime()) / 86400000;
          if (diffDays <= 7) {
            const sim = textSimilarity(tx.normalized_description, p.reference_number || '');
            if (sim > 0.8) {
              bestMatch = {
                bankTransactionId: tx.id,
                sourceType: 'payment',
                sourceId: p.id,
                confidence: 95,
                matchReason: 'Payment matched on amount, date proximity, and reference'
              };
              break; 
            }
          }
        }
      }
    }
    if (bestMatch) { suggestions.push(bestMatch); continue; }

    if (tx.credit > 0 && openInvoices) {
      for (const inv of openInvoices) {
        const invoiceOutstanding = Number(inv.total) - Number(inv.paid_amount || 0);
        if (Math.abs(invoiceOutstanding - Number(tx.credit)) < 0.01) {
          const clientName = inv.clients?.name || '';
          const hasRef = tx.normalized_description.includes(inv.invoice_number) || textSimilarity(tx.normalized_description, clientName) > 0.5;
          if (hasRef) {
            bestMatch = {
              bankTransactionId: tx.id,
              sourceType: 'invoice',
              sourceId: inv.id,
              confidence: 90,
              matchReason: `Matched Invoice #${inv.invoice_number} by amount and reference`
            };
            break;
          }
        }
      }
    }
    if (bestMatch) { suggestions.push(bestMatch); continue; }

    if (tx.debit > 0 && expenses) {
      for (const exp of expenses) {
        if (Math.abs(Number(exp.amount) - Number(tx.debit)) < 0.01) {
          const diffDays = Math.abs(new Date(tx.transaction_date).getTime() - new Date(exp.expense_date).getTime()) / 86400000;
          if (diffDays <= 7) {
            const sim = textSimilarity(tx.normalized_description, exp.description || exp.category || '');
            if (sim > 0.4) {
              bestMatch = {
                bankTransactionId: tx.id,
                sourceType: 'expense',
                sourceId: exp.id,
                confidence: 85,
                matchReason: `Matched Expense by amount and supplier description`
              };
              break;
            }
          }
        }
      }
    }
    if (bestMatch) { suggestions.push(bestMatch); continue; }
  }

  return suggestions;
}

export async function approveReconciliation(
  businessId: string,
  bankTransactionId: string,
  match: MatchSuggestion,
  userId: string
) {
  const { data: bankTx } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('id', bankTransactionId)
    .single();

  if (!bankTx) throw new Error('Bank transaction not found.');
  if (bankTx.reconciliation_status === 'approved') throw new Error('Already reconciled.');

  const entityId = match.sourceId;

  if (match.sourceType === 'invoice') {
    const { data: inv } = await supabase.from('invoices').select('*').eq('id', match.sourceId).single();
    if (!inv) throw new Error('Invoice not found.');

    const paymentAmount = Number(bankTx.credit);
    const { data: payment } = await supabase.from('payments').insert({
      business_id: businessId,
      invoice_id: inv.id,
      amount: paymentAmount,
      payment_date: bankTx.transaction_date,
      payment_method: 'bank_transfer',
      reference_number: bankTx.reference || bankTx.normalized_description
    }).select().single();

    if (payment) {
      await postingEngine.postInvoicePayment({
        businessId,
        paymentId: payment.id,
        amount: paymentAmount,
        description: `Payment for Invoice #${inv.invoice_number}`,
        date: bankTx.transaction_date
      });
    }

    const newPaidAmount = Number(inv.paid_amount || 0) + paymentAmount;
    const isFullyPaid = Math.abs(Number(inv.total) - newPaidAmount) < 0.01 || newPaidAmount >= Number(inv.total);
    await supabase.from('invoices').update({
      paid_amount: newPaidAmount,
      status: isFullyPaid ? 'paid' : 'partially_paid'
    }).eq('id', inv.id);

  } else if (match.sourceType === 'expense') {
    // Expense linking is mostly handled separately or just links existing ledger entries
  }

  await supabase.from('bank_transactions').update({ reconciliation_status: 'approved' }).eq('id', bankTransactionId);

  await supabase.from('reconciliation_audit_log').insert({
    action_type: 'match_approved',
    entity_type: match.sourceType,
    entity_id: entityId,
    old_value: 'unmatched',
    new_value: 'approved',
    user_id: userId,
    timestamp: new Date().toISOString()
  });
}
