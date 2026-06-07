import { ledgerService } from '../lib/ledger';
import type { LedgerEntry } from '../lib/ledger';

export interface ExpensePostingParams {
  businessId: string;
  expenseId: string;
  amount: number; // total amount paid
  netAmount: number;
  vatAmount: number;
  vatClaimable: boolean;
  description: string;
  date: string;
  paymentMethod: string;
  accrued?: boolean; // If true, CR to Accounts Payable instead of Bank
}

export interface PaymentPostingParams {
  businessId: string;
  paymentId: string;
  amount: number;
  description: string;
  date: string;
}

export interface ExpensePaymentPostingParams {
  businessId: string;
  paymentId: string;
  amount: number;
  description: string;
  date: string;
}

/**
 * Centralized Posting Engine for Zande.
 * All accounting postings must flow through this engine.
 */
export const postingEngine = {
  /**
   * Helper to validate that a transaction is balanced.
   */
  validateBalance(entries: LedgerEntry[]) {
    let debits = 0;
    let credits = 0;
    for (const entry of entries) {
      if (entry.entry_type === 'debit') {
        debits += Number(entry.amount);
      } else {
        credits += Number(entry.amount);
      }
    }
    // Round to 2 decimal places to avoid floating point issues
    const diff = Math.abs(debits - credits);
    if (diff > 0.01) {
      throw new Error(`Transaction is not balanced. Debits (R${debits.toFixed(2)}) != Credits (R${credits.toFixed(2)})`);
    }
  },

  /**
   * Posts an invoice payment.
   * Debit: Bank (1000)
   * Credit: Accounts Receivable (1100)
   */
  async postInvoicePayment(params: PaymentPostingParams): Promise<string> {
    const { businessId, paymentId, amount, description, date } = params;

    const bankAccountId = await ledgerService.getAccountIdByCode(businessId, '1000');
    const arAccountId = await ledgerService.getAccountIdByCode(businessId, '1100');

    const entries: LedgerEntry[] = [
      { account_id: bankAccountId, amount, entry_type: 'debit', description: `DR Bank - ${description}` },
      { account_id: arAccountId, amount, entry_type: 'credit', description: `CR Accounts Receivable - ${description}` }
    ];

    this.validateBalance(entries);

    return ledgerService.postTransaction({
      business_id: businessId,
      description,
      reference_type: 'payment',
      reference_id: paymentId,
      entries,
      date
    });
  },

  /**
   * Posts an expense.
   * Debit: Operating Expenses (5000)
   * Debit: VAT Payable (2100) - Input VAT if claimable
   * Credit: Bank (1000) or Accounts Payable (2000)
   */
  async postExpense(params: ExpensePostingParams): Promise<string> {
    const { businessId, expenseId, amount, netAmount, vatAmount, vatClaimable, description, date, accrued } = params;

    const opexAccountId = await ledgerService.getAccountIdByCode(businessId, '5000');
    const vatAccountId = await ledgerService.getAccountIdByCode(businessId, '2100');
    
    // Credit account depends on whether it is accrued (Accounts Payable) or paid immediately (Bank)
    const creditAccountId = await ledgerService.getAccountIdByCode(
      businessId, 
      accrued ? '2000' : '1000'
    );

    const entries: LedgerEntry[] = [];

    // DR Operating Expenses for the net amount (or total if VAT is not claimable)
    const expenseDebitAmount = vatClaimable ? netAmount : amount;
    entries.push({
      account_id: opexAccountId,
      amount: expenseDebitAmount,
      entry_type: 'debit',
      description: `DR Expense - ${description}`
    });

    // DR VAT Payable for claimable input VAT
    if (vatClaimable && vatAmount > 0) {
      entries.push({
        account_id: vatAccountId,
        amount: vatAmount,
        entry_type: 'debit',
        description: `DR Input VAT - ${description}`
      });
    }

    // CR Bank or Accounts Payable for total amount
    entries.push({
      account_id: creditAccountId,
      amount,
      entry_type: 'credit',
      description: accrued ? `CR Accounts Payable - ${description}` : `CR Bank - ${description}`
    });

    this.validateBalance(entries);

    return ledgerService.postTransaction({
      business_id: businessId,
      description,
      reference_type: 'expense',
      reference_id: expenseId,
      entries,
      date
    });
  },

  /**
   * Posts a payment of an accrued expense.
   * Debit: Accounts Payable (2000)
   * Credit: Bank (1000)
   */
  async postExpensePayment(params: ExpensePaymentPostingParams): Promise<string> {
    const { businessId, paymentId, amount, description, date } = params;

    const apAccountId = await ledgerService.getAccountIdByCode(businessId, '2000');
    const bankAccountId = await ledgerService.getAccountIdByCode(businessId, '1000');

    const entries: LedgerEntry[] = [
      { account_id: apAccountId, amount, entry_type: 'debit', description: `DR Accounts Payable - ${description}` },
      { account_id: bankAccountId, amount, entry_type: 'credit', description: `CR Bank - ${description}` }
    ];

    this.validateBalance(entries);

    return ledgerService.postTransaction({
      business_id: businessId,
      description,
      reference_type: 'payment',
      reference_id: paymentId,
      entries,
      date
    });
  }
};
