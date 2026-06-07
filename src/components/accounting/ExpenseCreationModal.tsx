import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { postingEngine } from '../../accounting/postingEngine';
import Modal from '../Modal';

interface ExpenseCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: {
    id: string;
    transaction_date: string;
    description: string;
    debit: number;
    reference_number?: string;
  } | null;
  businessId: string;
  onSuccess: () => void;
}

export default function ExpenseCreationModal({
  isOpen,
  onClose,
  transaction,
  businessId,
  onSuccess
}: ExpenseCreationModalProps) {
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [vatTreatment, setVatTreatment] = useState<'inclusive' | 'exclusive' | 'none'>('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && businessId) {
      fetchCategories();
      if (transaction) {
        setMerchant(transaction.description.split(' ')[0] || '');
        setDescription(transaction.description);
      }
    }
  }, [isOpen, businessId, transaction]);

  async function fetchCategories() {
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('business_id', businessId)
        .order('name', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
      if (data && data.length > 0) {
        setSelectedCategoryId(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to fetch categories:', err);
    }
  }

  if (!transaction) return null;

  const originalAmount = Number(transaction.debit);

  // Calculations based on VAT treatment
  let netAmount = originalAmount;
  let vatAmount = 0;
  let totalAmount = originalAmount;
  let vatClaimable = false;

  if (vatTreatment === 'inclusive') {
    netAmount = originalAmount / 1.15;
    vatAmount = originalAmount - netAmount;
    vatClaimable = true;
  } else if (vatTreatment === 'exclusive') {
    netAmount = originalAmount;
    vatAmount = originalAmount * 0.15;
    totalAmount = originalAmount + vatAmount;
    vatClaimable = true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Create the expense record in Supabase
      const { data: expense, error: expErr } = await supabase
        .from('expenses')
        .insert({
          business_id: businessId,
          category_id: selectedCategoryId,
          amount: totalAmount,
          net_amount: netAmount,
          vat_amount: vatAmount,
          vat_claimable: vatClaimable,
          expense_date: transaction!.transaction_date,
          description,
          merchant,
          payment_method: 'bank_transfer',
          status: 'paid'
        })
        .select()
        .single();

      if (expErr || !expense) throw new Error(expErr?.message || 'Failed to create expense.');

      // 2. Post to General Ledger via Centralized Posting Engine
      await postingEngine.postExpense({
        businessId,
        expenseId: expense.id,
        amount: totalAmount,
        netAmount,
        vatAmount,
        vatClaimable,
        description,
        date: transaction!.transaction_date,
        paymentMethod: 'bank_transfer'
      });

      // 3. Mark bank transaction as approved
      const { error: bankErr } = await supabase
        .from('bank_transactions')
        .update({ reconciliation_status: 'approved' })
        .eq('id', transaction!.id);

      if (bankErr) throw bankErr;

      // 4. Create the reconciliation audit log
      // Find the transaction ID created by postingEngine
      const { data: ledgerTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('reference_type', 'expense')
        .eq('reference_id', expense.id)
        .single();

      if (ledgerTx) {
        await supabase.from('bank_reconciliations').insert({
          business_id: businessId,
          bank_transaction_id: transaction!.id,
          ledger_transaction_id: ledgerTx.id,
          notes: `Created new expense directly from statement. VAT Treatment: ${vatTreatment}.`
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the expense.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Expense from Transaction">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-status-overdue/10 border border-status-overdue/30 text-status-overdue font-mono text-xs">
            {error}
          </div>
        )}

        <div className="bg-surface-muted p-4 rounded-2xl border border-border-subtle space-y-2">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Transaction Details</p>
          <div className="flex justify-between">
            <span className="text-xs text-slate-400">Date:</span>
            <span className="text-xs font-mono text-slate-200">{transaction.transaction_date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-slate-400">Amount:</span>
            <span className="text-xs font-mono font-bold text-slate-200">R{originalAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-slate-400">Description:</span>
            <span className="text-xs text-slate-200 text-right truncate max-w-[200px]">{transaction.description}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">Category</label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full bg-surface-muted border border-border-subtle rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all"
              required
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">Merchant / Supplier</label>
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full bg-surface-muted border border-border-subtle rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all"
              placeholder="e.g. Vodacom, SARS"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">Expense Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-muted border border-border-subtle rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all"
              placeholder="e.g. Monthly Internet"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">VAT Treatment</label>
            <div className="grid grid-cols-3 gap-2">
              {(['none', 'inclusive', 'exclusive'] as const).map((treatment) => (
                <button
                  key={treatment}
                  type="button"
                  onClick={() => setVatTreatment(treatment)}
                  className={`py-3 rounded-xl border text-xs font-bold font-display uppercase tracking-wider transition-all ${
                    vatTreatment === treatment
                      ? 'bg-primary border-primary text-black'
                      : 'bg-surface-muted border-border-subtle text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {treatment === 'none' ? 'No VAT' : treatment === 'inclusive' ? 'VAT Inc' : 'VAT Exc'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border-subtle pt-6 space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Net Amount:</span>
            <span className="font-mono text-slate-200">R{netAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">VAT Amount (15%):</span>
            <span className="font-mono text-slate-200">R{vatAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-border-subtle/30 pt-3">
            <span className="text-white">Total Ledger Amount:</span>
            <span className="font-mono text-primary">R{totalAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
          </div>
          {vatTreatment === 'exclusive' && (
            <p className="text-[10px] text-yellow-500 font-mono">
              ⚠️ Warning: Total ledger amount exceeds bank debit to account for added VAT.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-surface-muted border border-border-subtle hover:bg-surface text-slate-300 font-bold font-display text-xs uppercase tracking-wider py-4 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-black font-bold font-display text-xs uppercase tracking-wider py-4 rounded-xl transition-all"
          >
            {loading ? 'Posting...' : 'Create & Post'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
