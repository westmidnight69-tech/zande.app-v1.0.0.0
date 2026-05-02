import { supabase } from './supabase';

export type EntryType = 'debit' | 'credit';

export interface LedgerEntry {
  account_id: string;
  amount: number;
  entry_type: EntryType;
  description?: string;
}

export interface PostTransactionParams {
  business_id: string;
  description: string;
  reference_type: 'invoice' | 'payment' | 'expense' | 'reversal';
  reference_id: string;
  entries: LedgerEntry[];
  date?: string;
}

/**
 * Service for managing the double-entry ledger.
 * All financial events in the app should flow through this service.
 */
export const ledgerService = {
  /**
   * Posts a balanced transaction to the ledger.
   */
  async postTransaction(params: PostTransactionParams) {
    const { business_id, description, reference_type, reference_id, entries, date } = params;

    // 1. Create the transaction header
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .upsert({
        business_id,
        description,
        reference_type,
        reference_id,
        date: date || new Date().toISOString(),
      }, { onConflict: 'reference_type, reference_id' })
      .select()
      .single();

    if (txError) throw new Error(`Failed to create transaction: ${txError.message}`);

    // 2. Prepare entries
    const ledgerEntries = entries.map(entry => ({
      transaction_id: tx.id,
      account_id: entry.account_id,
      business_id,
      amount: entry.amount,
      entry_type: entry.entry_type,
      description: entry.description || description,
    }));

    // 3. Insert entries
    // Note: The balance check trigger will fire on commit (deferred)
    const { error: entriesError } = await supabase
      .from('ledger_entries')
      .insert(ledgerEntries);

    if (entriesError) {
      // If entries fail, we should ideally delete the transaction header, 
      // but since we are append-only, the trigger should prevent this batch from committing if unbalanced.
      throw new Error(`Failed to post ledger entries: ${entriesError.message}`);
    }

    return tx.id;
  },

  /**
   * Resolves a system account ID by its standardized code for a business.
   */
  async getAccountIdByCode(businessId: string, code: string): Promise<string> {
    const { data, error } = await supabase
      .from('accounts')
      .select('id')
      .eq('business_id', businessId)
      .eq('code', code)
      .single();

    if (error || !data) {
      throw new Error(`Account with code ${code} not found for business ${businessId}. Please ensure accounts are seeded.`);
    }

    return data.id;
  },

  /**
   * Helper to post an invoice to the ledger.
   * Debit: Accounts Receivable (1100)
   * Credit: Sales Revenue (4000)
   * Credit: VAT Payable (2100) - if applicable
   */
  async postInvoice(businessId: string, invoice: any) {
    const arAccountId = await this.getAccountIdByCode(businessId, '1100');
    const salesAccountId = await this.getAccountIdByCode(businessId, '4000');
    const vatAccountId = await this.getAccountIdByCode(businessId, '2100');

    const total = Number(invoice.total);
    const subtotal = Number(invoice.subtotal || total);
    const vat = total - subtotal;

    const entries: LedgerEntry[] = [
      { account_id: arAccountId, amount: total, entry_type: 'debit', description: `Invoice #${invoice.invoice_number}` },
      { account_id: salesAccountId, amount: subtotal, entry_type: 'credit', description: `Revenue from Invoice #${invoice.invoice_number}` }
    ];

    if (vat > 0) {
      entries.push({ account_id: vatAccountId, amount: vat, entry_type: 'credit', description: `VAT on Invoice #${invoice.invoice_number}` });
    }

    return this.postTransaction({
      business_id: businessId,
      description: `Invoice #${invoice.invoice_number} generated for ${invoice.clients?.name || 'Client'}`,
      reference_type: 'invoice',
      reference_id: invoice.id,
      entries,
      date: invoice.issue_date
    });
  },

  /**
   * Helper to post a payment received to the ledger.
   * Debit: Bank (1000)
   * Credit: Accounts Receivable (1100)
   */
  async postPaymentReceived(businessId: string, payment: any) {
    const bankAccountId = await this.getAccountIdByCode(businessId, '1000');
    const arAccountId = await this.getAccountIdByCode(businessId, '1100');

    return this.postTransaction({
      business_id: businessId,
      description: `Payment received for Invoice #${payment.invoices?.invoice_number || payment.invoice_id}`,
      reference_type: 'payment',
      reference_id: payment.id,
      entries: [
        { account_id: bankAccountId, amount: Number(payment.amount), entry_type: 'debit' },
        { account_id: arAccountId, amount: Number(payment.amount), entry_type: 'credit' }
      ],
      date: payment.payment_date
    });
  },

  /**
   * Helper to post an expense to the ledger.
   * Debit: Operating Expenses (5000)
   * Credit: Bank (1000)
   */
  async postExpense(businessId: string, expense: any) {
    const expenseAccountId = await this.getAccountIdByCode(businessId, '5000');
    const bankAccountId = await this.getAccountIdByCode(businessId, '1000');

    return this.postTransaction({
      business_id: businessId,
      description: `Expense: ${expense.description || expense.category}`,
      reference_type: 'expense',
      reference_id: expense.id,
      entries: [
        { account_id: expenseAccountId, amount: Number(expense.amount), entry_type: 'debit' },
        { account_id: bankAccountId, amount: Number(expense.amount), entry_type: 'credit' }
      ],
      date: expense.expense_date
    });
  },

  /**
   * Reverses a transaction by creating an equal and opposite transaction.
   */
  async reverseTransaction(transactionId: string, reason: string) {
    // 1. Get original transaction and entries
    const { data: originalTx, error: txError } = await supabase
      .from('transactions')
      .select('*, ledger_entries(*)')
      .eq('id', transactionId)
      .single();

    if (txError) throw new Error(`Failed to fetch original transaction: ${txError.message}`);

    // 2. Prepare reversal entries (swap debit/credit)
    const reversalEntries: LedgerEntry[] = originalTx.ledger_entries.map((entry: any) => ({
      account_id: entry.account_id,
      amount: entry.amount,
      entry_type: entry.entry_type === 'debit' ? 'credit' : 'debit',
      description: `Reversal: ${entry.description || originalTx.description}`
    }));

    // 3. Post reversal
    const reversalTxId = await this.postTransaction({
      business_id: originalTx.business_id,
      description: `Reversal of transaction ${transactionId}: ${reason}`,
      reference_type: 'reversal',
      reference_id: transactionId, // Using the original ID as the reference for reversal
      entries: reversalEntries
    });

    // 4. Record reversal mapping
    await supabase.from('transaction_reversals').insert({
      original_transaction_id: transactionId,
      reversal_transaction_id: reversalTxId,
      reason
    });

    return reversalTxId;
  },

  /**
   * Fetches the trial balance for a business.
   */
  async getTrialBalance(businessId: string) {
    const { data, error } = await supabase
      .from('accounts')
      .select(`
        id, code, name, type, normal_balance,
        ledger_entries (amount, entry_type)
      `)
      .eq('business_id', businessId);

    if (error) throw error;

    return data.map((account: any) => {
      let debit = 0;
      let credit = 0;

      account.ledger_entries.forEach((entry: any) => {
        if (entry.entry_type === 'debit') debit += Number(entry.amount);
        else credit += Number(entry.amount);
      });

      const balance = account.normal_balance === 'debit' ? debit - credit : credit - debit;

      return {
        ...account,
        debit,
        credit,
        balance
      };
    });
  },

  /**
   * Fetches journal entries for a business.
   */
  async getJournalEntries(businessId: string, limit = 50) {
    const { data, error } = await supabase
      .from('ledger_entries')
      .select(`
        id, amount, entry_type, description, created_at,
        transactions!inner (date, description, reference_type),
        accounts!inner (name, code)
      `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
};
