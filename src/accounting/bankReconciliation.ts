import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { ledgerService } from '../lib/ledger';

export interface BankTransactionRow {
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  balance?: number;
}

export interface ReconciliationMatch {
  bankTransactionId: string;
  appTransactionType: 'invoice' | 'expense' | 'payment';
  appTransactionId: string;
  confidenceScore: number; // 0 to 1
  matchedAmount: number;
  description: string;
}

/**
 * Parses an Excel file containing a bank statement.
 * Supports standard formats where columns might be Date, Description, Amount, Debit, Credit.
 */
export async function parseBankStatementExcel(file: File): Promise<BankTransactionRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to JSON, treating first row as headers
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: null });
        
        const rows: BankTransactionRow[] = [];
        
        json.forEach((row: any) => {
          // Heuristics to find columns
          const dateStr = row['Date'] || row['Date '] || row['Transaction Date'] || row['Post Date'];
          const desc = row['Description'] || row['Details'] || row['Memo'] || row['Payee'];
          
          let amount = 0;
          let type: 'debit' | 'credit' = 'debit';

          if (row['Amount'] !== undefined && row['Amount'] !== null) {
            amount = parseFloat(row['Amount']);
            if (amount < 0) {
              type = 'debit'; // Money out
              amount = Math.abs(amount);
            } else {
              type = 'credit'; // Money in
            }
          } else if (row['Debit'] || row['Paid Out'] || row['Withdrawal']) {
            amount = parseFloat(row['Debit'] || row['Paid Out'] || row['Withdrawal']);
            type = 'debit';
          } else if (row['Credit'] || row['Paid In'] || row['Deposit']) {
            amount = parseFloat(row['Credit'] || row['Paid In'] || row['Deposit']);
            type = 'credit';
          }

          if (dateStr && desc && amount > 0 && !isNaN(amount)) {
            // Basic date parsing to ISO if possible
            let parsedDate = new Date(dateStr);
            if (isNaN(parsedDate.getTime())) {
                // Try Excel serial date
                if (typeof dateStr === 'number') {
                    parsedDate = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
                } else {
                     parsedDate = new Date(); // fallback
                }
            }

            rows.push({
              date: parsedDate.toISOString(),
              description: String(desc).trim(),
              amount,
              type
            });
          }
        });
        
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
}

/**
 * Calculates a simple similarity score between two strings (0 to 1).
 */
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  if (s1 === s2) return 1;
  
  // Very basic token matching
  const tokens1 = s1.split(/[\s,.-]+/);
  const tokens2 = s2.split(/[\s,.-]+/);
  let matches = 0;
  
  tokens1.forEach(t1 => {
    if (t1.length > 2 && tokens2.includes(t1)) matches++;
  });
  
  const maxTokens = Math.max(tokens1.length, tokens2.length);
  return maxTokens > 0 ? matches / maxTokens : 0;
}

/**
 * Runs the similarity engine to match bank transactions against un-reconciled app data (invoices, expenses).
 */
export async function matchTransactions(businessId: string, bankRows: BankTransactionRow[]): Promise<ReconciliationMatch[]> {
  const matches: ReconciliationMatch[] = [];

  // Fetch unpaid invoices (expecting money in - credit in bank)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, clients(name)')
    .eq('business_id', businessId)
    .neq('status', 'paid');

  // Fetch expenses (expecting money out - debit in bank)
  // We'll look at recent expenses that might match
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('business_id', businessId);

  for (const [index, row] of bankRows.entries()) {
    let bestMatch: ReconciliationMatch | null = null;
    let highestScore = 0;

    // Money coming in: could be an invoice payment
    if (row.type === 'credit' && invoices) {
      for (const invoice of invoices) {
        let score = 0;
        
        // 1. Amount match is a strong signal
        const total = parseFloat(invoice.total);
        if (Math.abs(total - row.amount) < 0.01) {
          score += 0.5;
        }

        // 2. String matching (client name, invoice number in bank description)
        const descMatch = stringSimilarity(row.description, invoice.clients?.name || '') + 
                          stringSimilarity(row.description, `INV-${invoice.invoice_number}`);
        score += descMatch * 0.5;

        // 3. Date proximity (payment should be on or after issue date)
        const bankDate = new Date(row.date);
        const issueDate = new Date(invoice.issue_date);
        if (bankDate >= issueDate) {
           const daysDiff = (bankDate.getTime() - issueDate.getTime()) / (1000 * 3600 * 24);
           if (daysDiff <= 30) score += 0.2; // Paid within 30 days
        }

        if (score > highestScore && score > 0.4) {
          highestScore = score;
          bestMatch = {
            bankTransactionId: `temp-${index}`, // Real ID assigned upon db insert
            appTransactionType: 'invoice',
            appTransactionId: invoice.id,
            confidenceScore: Math.min(score, 1),
            matchedAmount: row.amount,
            description: `Matches Invoice #${invoice.invoice_number} for ${invoice.clients?.name}`
          };
        }
      }
    }

    // Money going out: could be an existing expense or a new one
    if (row.type === 'debit' && expenses) {
        for (const expense of expenses) {
            let score = 0;
            const amount = parseFloat(expense.amount);
            if (Math.abs(amount - row.amount) < 0.01) {
                score += 0.5;
            }

            score += stringSimilarity(row.description, expense.description || '') * 0.3;
            score += stringSimilarity(row.description, expense.vendor || '') * 0.3;

            if (score > highestScore && score > 0.4) {
                highestScore = score;
                bestMatch = {
                  bankTransactionId: `temp-${index}`,
                  appTransactionType: 'expense',
                  appTransactionId: expense.id,
                  confidenceScore: Math.min(score, 1),
                  matchedAmount: row.amount,
                  description: `Matches Expense: ${expense.description || expense.category}`
                };
            }
        }
    }

    if (bestMatch) {
      matches.push(bestMatch);
    }
  }

  return matches;
}

/**
 * Commits an invoice match. Marks invoice as paid and posts payment to ledger.
 */
export async function confirmInvoiceMatch(businessId: string, bankRow: BankTransactionRow, invoiceId: string) {
    const { data: invoice, error: fetchError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();
    
    if (fetchError) throw fetchError;

    // 1. Create payment record
    const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
            invoice_id: invoiceId,
            business_id: businessId,
            amount: bankRow.amount,
            payment_date: bankRow.date,
            payment_method: 'bank_transfer',
            reference_number: bankRow.description.substring(0, 50)
        })
        .select()
        .single();

    if (paymentError) throw paymentError;

    // 2. Mark invoice as paid
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);

    // 3. Post to ledger (Debit Bank, Credit AR)
    await ledgerService.postPaymentReceived(businessId, payment);

    return payment;
}

/**
 * Creates a new expense directly from a bank transaction and posts to ledger.
 */
export async function createExpenseFromBank(businessId: string, bankRow: BankTransactionRow, categoryId: string) {
     const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
            business_id: businessId,
            category_id: categoryId,
            amount: bankRow.amount,
            expense_date: bankRow.date,
            description: bankRow.description,
            payment_method: 'bank_transfer'
        })
        .select()
        .single();

    if (expenseError) throw expenseError;

    // Post to ledger (Debit Expense, Credit Bank)
    await ledgerService.postExpense(businessId, expense);

    return expense;
}
