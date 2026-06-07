import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { postingEngine } from './postingEngine';

export interface BankTransactionRow {
  transaction_date: string;
  description: string;
  reference_number: string;
  debit: number;
  credit: number;
  balance: number;
  transaction_hash: string;
}

export interface MatchSuggestion {
  bankTransactionId: string;
  sourceType: 'invoice' | 'expense';
  sourceId: string;
  confidence: number;
  matchMethod: string;
  description: string;
}

/**
 * Utility to compute a SHA-256 hash string of a given input.
 */
async function computeHash(input: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalizes and parses the statement.
 */
export async function parseAndValidateBankStatement(
  file: File,
  businessId: string,
  _bankAccountId: string
): Promise<{
  rows: BankTransactionRow[];
  openingBalance: number;
  closingBalance: number;
  startDate: string;
  endDate: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: null }) as any[];

        if (json.length === 0) {
          throw new Error('The uploaded bank statement file is empty.');
        }

        const rows: BankTransactionRow[] = [];
        let totalCredits = 0;
        let totalDebits = 0;
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        for (const row of json) {
          // Dynamic Column Mapping
          const rawDate = row['Date'] || row['Transaction Date'] || row['Posting Date'] || row['Post Date'] || row['date'] || row['transaction_date'];
          const rawDescription = row['Description'] || row['Narrative'] || row['Details'] || row['Memo'] || row['Payee'] || row['description'];
          const rawReference = row['Reference'] || row['Ref Number'] || row['Ref'] || row['Reference Number'] || row['reference_number'] || '';
          
          let debit = 0;
          let credit = 0;

          // Detect debit/credit columns
          const rawDebit = row['Debit'] || row['Paid Out'] || row['Withdrawal'] || row['debit'];
          const rawCredit = row['Credit'] || row['Paid In'] || row['Deposit'] || row['credit'];
          const rawAmount = row['Amount'] || row['amount'];

          if (rawDebit !== undefined && rawDebit !== null) {
            debit = Math.abs(parseFloat(rawDebit)) || 0;
          }
          if (rawCredit !== undefined && rawCredit !== null) {
            credit = Math.abs(parseFloat(rawCredit)) || 0;
          }

          if (rawAmount !== undefined && rawAmount !== null) {
            const parsedAmt = parseFloat(rawAmount);
            if (parsedAmt < 0) {
              debit = Math.abs(parsedAmt);
            } else {
              credit = parsedAmt;
            }
          }

          const balance = parseFloat(row['Balance'] || row['balance'] || '0') || 0;

          if (rawDate && rawDescription && (debit > 0 || credit > 0)) {
            let parsedDate = new Date(rawDate);
            if (isNaN(parsedDate.getTime()) && typeof rawDate === 'number') {
              // Handle Excel date serial
              parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
            }

            if (isNaN(parsedDate.getTime())) {
              continue;
            }

            const dateStr = parsedDate.toISOString().split('T')[0];
            if (!minDate || parsedDate < minDate) minDate = parsedDate;
            if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;

            // Generate unique transaction hash: date + amount + reference + description
            const amountVal = credit > 0 ? credit : -debit;
            const hashInput = `${businessId}_${dateStr}_${amountVal.toFixed(2)}_${String(rawReference).trim()}_${String(rawDescription).trim()}`;
            const hash = await computeHash(hashInput);

            rows.push({
              transaction_date: dateStr,
              description: String(rawDescription).trim(),
              reference_number: String(rawReference).trim(),
              debit,
              credit,
              balance,
              transaction_hash: hash
            });

            totalCredits += credit;
            totalDebits += debit;
          }
        }

        if (rows.length === 0) {
          throw new Error('No valid transaction rows could be matched. Check column headers.');
        }

        // Sort chronologically
        rows.sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());

        // Validate balances: Opening Balance + Total Credits - Total Debits = Closing Balance
        const openingBalance = rows[0].balance - (rows[0].credit - rows[0].debit);
        const closingBalance = rows[rows.length - 1].balance;

        const expectedClosing = openingBalance + totalCredits - totalDebits;
        const diff = Math.abs(closingBalance - expectedClosing);

        if (diff > 0.05) {
          throw new Error(
            `Statement validation failed! Opening Balance (R${openingBalance.toFixed(2)}) + Credits (R${totalCredits.toFixed(2)}) - Debits (R${totalDebits.toFixed(2)}) = R${expectedClosing.toFixed(2)}, but Statement Closing Balance is R${closingBalance.toFixed(2)}.`
          );
        }

        resolve({
          rows,
          openingBalance,
          closingBalance,
          startDate: minDate ? minDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          endDate: maxDate ? maxDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
}

/**
 * Heuristics helper to calculate text similarity score
 */
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

/**
 * Runs matching engine on the un-reconciled transactions.
 */
export async function matchBankTransactions(
  businessId: string,
  bankTransactionIds: string[]
): Promise<MatchSuggestion[]> {
  const suggestions: MatchSuggestion[] = [];

  // Fetch bank transactions
  const { data: bankTxs } = await supabase
    .from('bank_transactions')
    .select('*')
    .in('id', bankTransactionIds)
    .eq('reconciliation_status', 'unmatched');

  if (!bankTxs || bankTxs.length === 0) return [];

  // Fetch open invoices (credits)
  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('*, clients(name)')
    .eq('business_id', businessId)
    .in('status', ['sent', 'partially_paid']);

  // Fetch expenses (debits)
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('business_id', businessId);

  for (const tx of bankTxs) {
    let bestMatch: MatchSuggestion | null = null;
    let maxConfidence = 0;

    // Incoming cash (Credit) - Match against Invoices
    if (tx.credit > 0 && openInvoices) {
      for (const inv of openInvoices) {
        let score = 0;

        // 1. Exact Amount Match = 25
        const invoiceOutstanding = Number(inv.total) - Number(inv.paid_amount || 0);
        if (Math.abs(invoiceOutstanding - Number(tx.credit)) < 0.01) {
          score += 25;
        }

        // 2. Invoice Number Match = 60
        const invNum = String(inv.invoice_number);
        if (tx.description.toLowerCase().includes(invNum.toLowerCase()) || 
            (tx.reference_number && tx.reference_number.toLowerCase().includes(invNum.toLowerCase()))) {
          score += 60;
        }

        // 3. Customer Name Match = 5
        const clientName = inv.clients?.name || '';
        if (clientName && textSimilarity(tx.description, clientName) > 0.4) {
          score += 5;
        }

        // 4. Date Proximity = 10 (within 30 days)
        const txDate = new Date(tx.transaction_date);
        const invDate = new Date(inv.issue_date);
        const diffDays = Math.abs(txDate.getTime() - invDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays <= 30) {
          score += 10;
        }

        if (score > maxConfidence && score >= 40) {
          maxConfidence = score;
          bestMatch = {
            bankTransactionId: tx.id,
            sourceType: 'invoice',
            sourceId: inv.id,
            confidence: score,
            matchMethod: score >= 85 ? 'auto' : 'heuristic',
            description: `Invoice #${inv.invoice_number} (${inv.clients?.name || 'Client'}) - R${Number(inv.total).toFixed(2)}`
          };
        }
      }
    }

    // Outgoing cash (Debit) - Match against Expenses
    if (tx.debit > 0 && expenses) {
      for (const exp of expenses) {
        let score = 0;

        // 1. Exact Amount Match = 25
        if (Math.abs(Number(exp.amount) - Number(tx.debit)) < 0.01) {
          score += 25;
        }

        // 2. Supplier / description Match = 65 (60 invoice num ref equivalent)
        const expDesc = exp.description || '';
        const expCategory = exp.category || '';
        const sim = Math.max(textSimilarity(tx.description, expDesc), textSimilarity(tx.description, expCategory));
        score += Math.round(sim * 65);

        // 3. Date Proximity = 10 (within 7 days for expenses)
        const txDate = new Date(tx.transaction_date);
        const expDate = new Date(exp.expense_date);
        const diffDays = Math.abs(txDate.getTime() - expDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays <= 7) {
          score += 10;
        }

        if (score > maxConfidence && score >= 40) {
          maxConfidence = score;
          bestMatch = {
            bankTransactionId: tx.id,
            sourceType: 'expense',
            sourceId: exp.id,
            confidence: score,
            matchMethod: 'heuristic',
            description: `Expense: ${exp.description || exp.category} - R${Number(exp.amount).toFixed(2)}`
          };
        }
      }
    }

    if (bestMatch) {
      suggestions.push(bestMatch);
    }
  }

  return suggestions;
}

/**
 * Commits a matching decision. Handles partial payments, status shifts, posting engine events.
 */
export async function approveReconciliation(
  businessId: string,
  bankTransactionId: string,
  match: MatchSuggestion,
  userId: string
) {
  // 1. Retrieve the bank transaction
  const { data: bankTx, error: txErr } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('id', bankTransactionId)
    .single();

  if (txErr || !bankTx) throw new Error('Bank transaction not found.');

  // Prevent double reconciliation
  if (bankTx.reconciliation_status === 'approved') {
    throw new Error('This transaction is already reconciled.');
  }

  let ledgerTxId = '';

  if (match.sourceType === 'invoice') {
    // 2. Invoice Payment Handling
    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', match.sourceId)
      .single();

    if (invErr || !inv) throw new Error('Invoice not found.');

    const paymentAmount = Number(bankTx.credit);

    // Create payment record
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        business_id: businessId,
        invoice_id: inv.id,
        amount: paymentAmount,
        payment_date: bankTx.transaction_date,
        payment_method: 'bank_transfer',
        reference_number: bankTx.reference_number || bankTx.description.substring(0, 50)
      })
      .select()
      .single();

    if (payErr || !payment) throw new Error(`Failed to create payment: ${payErr?.message}`);

    // Post via Centralized Posting Engine
    ledgerTxId = await postingEngine.postInvoicePayment({
      businessId,
      paymentId: payment.id,
      amount: paymentAmount,
      description: `Payment received for Invoice #${inv.invoice_number} via statement reconciler`,
      date: bankTx.transaction_date
    });

    // Update Invoice status dynamically
    const newPaidAmount = Number(inv.paid_amount || 0) + paymentAmount;
    const isFullyPaid = Math.abs(Number(inv.total) - newPaidAmount) < 0.01 || newPaidAmount >= Number(inv.total);
    const newStatus = isFullyPaid ? 'paid' : 'partially_paid';

    await supabase
      .from('invoices')
      .update({
        paid_amount: newPaidAmount,
        status: newStatus
      })
      .eq('id', inv.id);

  } else if (match.sourceType === 'expense') {
    // 3. Match to existing Expense (just link to ledger entry of this expense)
    // Find transaction linked to this expense
    const { data: ledgerTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('reference_type', 'expense')
      .eq('reference_id', match.sourceId)
      .single();

    if (!ledgerTx) {
      throw new Error('Could not find the general ledger transaction for this expense.');
    }

    ledgerTxId = ledgerTx.id;
  }

  // 4. Update bank transaction status to approved
  await supabase
    .from('bank_transactions')
    .update({ reconciliation_status: 'approved' })
    .eq('id', bankTransactionId);

  // 5. Create reconciliation audit trail record
  await supabase.from('bank_reconciliations').insert({
    business_id: businessId,
    bank_transaction_id: bankTransactionId,
    ledger_transaction_id: ledgerTxId,
    matched_by: userId,
    notes: `Confidence: ${match.confidence}%. Method: ${match.matchMethod}.`
  });
}
