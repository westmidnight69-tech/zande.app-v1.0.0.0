import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../components/AuthProvider';
import { ledgerService } from '../lib/ledger';
import { format } from 'date-fns';
import {
  UploadCloud, CheckCircle, PlusCircle, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, ShieldCheck, AlertCircle, X, FileText,
  BarChart2, DollarSign, Activity
} from 'lucide-react';
import { processStatementFile, matchBankTransactions, approveReconciliation } from '../accounting/bankReconciliation';
import type { MatchSuggestion } from '../accounting/bankReconciliation';
import { uploadBankStatement } from '../accounting/storage';
import ExpenseCreationModal from '../components/accounting/ExpenseCreationModal';

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  branch_code: string;
  is_designated_cash_account: boolean;
  current_balance: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `R${Math.abs(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

// Group transactions by month for the mini bar chart
function groupByMonth(txs: any[]) {
  const map: Record<string, { income: number; expenses: number }> = {};
  txs.forEach(tx => {
    const key = format(new Date(tx.transaction_date), 'MMM yy');
    if (!map[key]) map[key] = { income: 0, expenses: 0 };
    map[key].income += Number(tx.credit || 0);
    map[key].expenses += Number(tx.debit || 0);
  });
  return Object.entries(map).slice(-6);
}

// Top spending categories inferred from normalized descriptions
function topCategories(txs: any[]) {
  const map: Record<string, number> = {};
  txs.filter(t => t.debit > 0).forEach(t => {
    const key = t.normalized_description?.split(' ')[0] || 'OTHER';
    map[key] = (map[key] || 0) + Number(t.debit);
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

// ─── Upload Zone ─────────────────────────────────────────────────────────────

function UploadZone({ onFile, loading }: { onFile: (f: File) => void; loading: boolean }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <>
      {/* DESKTOP: Drag & Drop zone */}
      <div
        className={`hidden md:flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-14 transition-all duration-300 cursor-pointer group ${
          dragging
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : 'border-border-subtle bg-surface/30 hover:border-primary/50 hover:bg-primary/5'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className={`size-20 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 ${
          dragging ? 'bg-primary/20 scale-110' : 'bg-surface-muted border border-border-subtle group-hover:bg-primary/10 group-hover:border-primary/30'
        }`}>
          <UploadCloud size={36} className={`transition-colors ${dragging ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
        </div>
        <h3 className="font-display text-xl font-bold text-white mb-2">
          {loading ? 'Processing statement…' : dragging ? 'Release to upload' : 'Drop your bank statement here'}
        </h3>
        <p className="text-slate-500 text-sm text-center max-w-xs mb-4">
          Supports PDF, Excel (.xlsx, .xls) and CSV formats
        </p>
        {!loading && (
          <span className="text-xs font-mono text-primary/70 uppercase tracking-widest border border-primary/20 px-4 py-1.5 rounded-full group-hover:border-primary/40 transition-colors">
            or click to browse files
          </span>
        )}
        {loading && (
          <div className="flex gap-1.5 mt-2">
            {[0,1,2].map(i => (
              <div key={i} className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
        <input ref={inputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} disabled={loading} />
      </div>

      {/* MOBILE: Upload button only */}
      <div className="md:hidden flex flex-col items-center justify-center bg-surface/30 border border-border-subtle rounded-3xl p-10">
        <div className="size-16 rounded-2xl bg-surface-muted border border-border-subtle flex items-center justify-center mb-4">
          <UploadCloud size={28} className="text-primary" />
        </div>
        <h3 className="font-display text-lg font-bold text-white mb-1">Upload Bank Statement</h3>
        <p className="text-slate-500 text-xs text-center mb-6">PDF, Excel or CSV</p>
        <label className="bg-primary text-black font-bold text-sm uppercase tracking-widest px-8 py-3.5 rounded-xl hover:bg-primary/90 cursor-pointer transition-all active:scale-95 shadow-[0_0_24px_rgba(var(--color-primary),0.3)] flex items-center gap-2">
          {loading ? 'Processing…' : 'Select File'}
          <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} disabled={loading} />
        </label>
      </div>
    </>
  );
}

// ─── Financials Dashboard ─────────────────────────────────────────────────────

function FinancialsDashboard({
  transactions, matches, ledgerBalance, bankBalance, loading,
  onConfirmMatch, onIgnore, onCreateExpense, onUploadAnother, uploadLoading
}: {
  transactions: any[];
  matches: any[];
  ledgerBalance: number;
  bankBalance: number;
  loading: boolean;
  onConfirmMatch: (txId: string, match: any) => void;
  onIgnore: (txId: string) => void;
  onCreateExpense: (tx: any) => void;
  onUploadAnother: (f: File) => void;
  uploadLoading: boolean;
}) {
  const totalIncome  = transactions.reduce((s, t) => s + Number(t.credit || 0), 0);
  const totalExpenses = transactions.reduce((s, t) => s + Number(t.debit || 0), 0);
  const netCashFlow  = totalIncome - totalExpenses;
  const avgTx       = transactions.length > 0 ? (totalIncome + totalExpenses) / transactions.length : 0;
  const balanceDiff = Math.abs(bankBalance - ledgerBalance);

  const monthlyData = groupByMonth(transactions);
  const maxVal = Math.max(...monthlyData.map(([, v]) => Math.max(v.income, v.expenses)), 1);
  const categories = topCategories(transactions);
  const totalSpend = categories.reduce((s, [, v]) => s + v, 0);

  const pendingCount  = transactions.filter(t => t.reconciliation_status === 'unmatched').length;
  const matchedCount  = matches.length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Income', value: fmt(totalIncome), icon: <TrendingUp size={18} />, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
          { label: 'Total Expenses', value: fmt(totalExpenses), icon: <TrendingDown size={18} />, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
          { label: 'Net Cash Flow', value: (netCashFlow >= 0 ? '+' : '-') + fmt(netCashFlow), icon: <Activity size={18} />, color: netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400', bg: netCashFlow >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10', border: netCashFlow >= 0 ? 'border-emerald-500/20' : 'border-rose-500/20' },
          { label: 'Avg. Transaction', value: fmt(avgTx), icon: <DollarSign size={18} />, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
        ].map(k => (
          <div key={k.label} className={`p-5 rounded-2xl border ${k.bg} ${k.border}`}>
            <div className={`flex items-center gap-2 mb-3 ${k.color}`}>
              {k.icon}
              <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-slate-400">{k.label}</span>
            </div>
            <p className={`font-mono text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Monthly Cash Flow Chart ── */}
        <div className="lg:col-span-2 bg-surface border border-border-subtle rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-bold text-white text-sm">Monthly Cash Flow</h3>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">Income vs Expenses</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-emerald-500" />Income</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-rose-500" />Expenses</span>
            </div>
          </div>
          {monthlyData.length === 0 ? (
            <div className="flex items-center justify-center h-36 text-slate-600 text-xs font-mono">No data</div>
          ) : (
            <div className="flex items-end gap-3 h-40">
              {monthlyData.map(([month, vals]) => (
                <div key={month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <div className="w-full flex items-end gap-0.5 h-28">
                    <div
                      className="flex-1 bg-emerald-500/80 rounded-t-sm transition-all duration-700 hover:bg-emerald-400"
                      style={{ height: `${(vals.income / maxVal) * 100}%`, minHeight: vals.income > 0 ? '4px' : 0 }}
                      title={`Income: ${fmt(vals.income)}`}
                    />
                    <div
                      className="flex-1 bg-rose-500/80 rounded-t-sm transition-all duration-700 hover:bg-rose-400"
                      style={{ height: `${(vals.expenses / maxVal) * 100}%`, minHeight: vals.expenses > 0 ? '4px' : 0 }}
                      title={`Expenses: ${fmt(vals.expenses)}`}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 truncate w-full text-center">{month}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Top Spending Categories ── */}
        <div className="bg-surface border border-border-subtle rounded-2xl p-6">
          <h3 className="font-display font-bold text-white text-sm mb-1">Top Spending</h3>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-5">By merchant category</p>
          {categories.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-600 text-xs font-mono">No expenses found</div>
          ) : (
            <div className="space-y-3">
              {categories.map(([cat, val], i) => {
                const pct = totalSpend > 0 ? (val / totalSpend) * 100 : 0;
                const colors = ['bg-primary', 'bg-cyan-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'];
                return (
                  <div key={cat}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-300 font-mono truncate max-w-[120px]">{cat}</span>
                      <span className="text-xs font-mono text-slate-400">{fmt(val)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`${colors[i % colors.length]} h-full rounded-full transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Balance Reconciliation Status ── */}
      <div className={`p-5 rounded-2xl border flex items-center gap-4 ${
        balanceDiff < 0.05 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-yellow-500/5 border-yellow-500/20'
      }`}>
        {balanceDiff < 0.05
          ? <ShieldCheck className="text-emerald-500 flex-shrink-0" size={22} />
          : <AlertCircle className="text-yellow-500 flex-shrink-0" size={22} />
        }
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-200">
            {balanceDiff < 0.05 ? 'Balances In Sync' : `Discrepancy: ${fmt(balanceDiff)}`}
          </p>
          <p className="text-[11px] font-mono text-slate-500 mt-0.5">
            Bank Statement Balance: {fmt(bankBalance)} · Ledger Bank: {fmt(ledgerBalance)}
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">{pendingCount} pending · {matchedCount} matched</p>
        </div>
      </div>

      {/* ── Transaction Table ── */}
      <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
        <div className="bg-surface-muted px-6 py-4 border-b border-border-subtle flex justify-between items-center flex-wrap gap-3">
          <div>
            <h3 className="font-display font-bold text-slate-100 text-sm">Unreconciled Transactions</h3>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5">{transactions.length} transactions pending review</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary text-[10px] font-mono font-bold px-3 py-1 rounded-full border border-primary/20">
              {pendingCount} PENDING
            </span>
            {/* Upload another button - visible on both desktop and mobile */}
            <label className="bg-surface text-slate-300 border border-border-subtle text-[10px] font-mono font-bold px-3 py-2 rounded-lg hover:border-primary/40 hover:text-white cursor-pointer transition-all flex items-center gap-2">
              <UploadCloud size={12} className="text-primary" />
              {uploadLoading ? 'Processing…' : 'Upload More'}
              <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) onUploadAnother(f); e.target.value = ''; }} disabled={uploadLoading} />
            </label>
          </div>
        </div>

        <div className="divide-y divide-border-subtle/30 max-h-[520px] overflow-y-auto">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600">
              <BarChart2 size={32} className="mb-3 opacity-40" />
              <p className="text-sm font-mono">All transactions reconciled</p>
            </div>
          ) : (
            transactions.map(tx => {
              const match = matches.find(m => m.bank_transaction_id === tx.id);
              return (
                <div key={tx.id} className="px-6 py-4 hover:bg-surface/50 transition-colors">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider flex-shrink-0">
                          {format(new Date(tx.transaction_date), 'dd MMM yyyy')}
                        </span>
                        {tx.reconciliation_status === 'flagged' && (
                          <span className="text-[8px] font-mono bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-1.5 py-0.5 rounded">FLAGGED</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-200 truncate">{tx.description}</p>
                      {tx.reference_number && <p className="text-[10px] font-mono text-slate-600 mt-0.5">Ref: {tx.reference_number}</p>}
                    </div>
                    <div className={`font-mono font-bold text-sm flex-shrink-0 ${tx.credit > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      <div className="flex items-center gap-1">
                        {tx.credit > 0 ? <ArrowUpRight size={14} className="text-emerald-500" /> : <ArrowDownRight size={14} className="text-slate-500" />}
                        {tx.credit > 0 ? fmt(tx.credit) : `-${fmt(tx.debit)}`}
                      </div>
                      {tx.balance != null && (
                        <p className="text-[9px] font-mono text-slate-600 text-right mt-0.5">Bal: {fmt(tx.balance)}</p>
                      )}
                    </div>
                  </div>

                  {/* Match / Actions row */}
                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                    {match ? (
                      <div className="flex-1 min-w-[220px] flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 rounded-xl">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="text-emerald-500 flex-shrink-0" size={14} />
                          <div>
                            <p className="text-[9px] text-emerald-500/70 uppercase font-mono font-bold">
                              Suggested Match ({match.confidence}%)
                            </p>
                            <p className="text-xs text-emerald-400 font-bold">
                              {match.source_type === 'invoice' ? 'Invoice Match' : match.source_type === 'payment' ? 'Payment Match' : 'Expense Match'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => onConfirmMatch(tx.id, match)}
                          disabled={loading}
                          className="bg-emerald-500 text-black px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                        >
                          Confirm
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-600 font-mono italic flex-1">No automated match found</span>
                    )}

                    <div className="flex gap-2 flex-shrink-0">
                      {tx.debit > 0 && (
                        <button
                          onClick={() => onCreateExpense(tx)}
                          disabled={loading}
                          className="flex items-center gap-1.5 bg-surface-muted text-slate-300 border border-border-subtle hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                        >
                          <PlusCircle size={12} /> Expense
                        </button>
                      )}
                      <button
                        onClick={() => onIgnore(tx.id)}
                        className="flex items-center gap-1.5 bg-surface-muted text-slate-500 border border-border-subtle hover:text-rose-400 hover:border-rose-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                      >
                        <X size={12} /> Ignore
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BankAccounts() {
  const { business, user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [activeAccount, setActiveAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState<number>(0);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const fetchData = useCallback(async (accountId?: string) => {
    if (!business?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data: accountsData, error: accErr } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('business_id', business.id);

      if (accErr) throw accErr;

      let fetchedAccounts = accountsData || [];

      if (fetchedAccounts.length === 0) {
        const { data: newAcc, error: seedErr } = await supabase
          .from('bank_accounts')
          .insert({
            business_id: business.id,
            bank_name: 'Primary Business Bank',
            account_number: '•••• 1234',
            account_type: 'Cheque',
            opening_balance: 0,
            current_balance: 0,
            is_designated_cash_account: true
          })
          .select()
          .single();

        if (seedErr) throw seedErr;
        fetchedAccounts = [newAcc];
      }

      setAccounts(fetchedAccounts);

      const targetId = accountId || activeAccount?.id;
      const currentActive = targetId
        ? fetchedAccounts.find(a => a.id === targetId)
        : fetchedAccounts[0];

      if (currentActive) {
        setActiveAccount(currentActive);

        const { data: txs, error: txsErr } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('bank_account_id', currentActive.id)
          .neq('reconciliation_status', 'approved')
          .order('transaction_date', { ascending: false });

        if (txsErr) throw txsErr;
        setTransactions(txs || []);

        if (txs && txs.length > 0) {
          const { data: mData } = await supabase
            .from('reconciliation_matches')
            .select('*')
            .in('bank_transaction_id', txs.map(t => t.id));
          setMatches(mData || []);
        } else {
          setMatches([]);
        }

        try {
          const balances = await ledgerService.getTrialBalance(business.id);
          const bankLedger = balances.find(b => b.code === '1000');
          setLedgerBalance(bankLedger?.balance || 0);
        } catch { setLedgerBalance(0); }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load bank data.');
    } finally {
      setLoading(false);
    }
  }, [business?.id, activeAccount?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const processFile = async (file: File) => {
    if (!activeAccount || !business?.id) return;
    setUploadLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let fileUrl = '';
      try { fileUrl = await uploadBankStatement(file, business.id); } catch { /* non-fatal */ }

      const { statementData, clean, duplicates, flagged } = await processStatementFile(file, business.id, activeAccount.id);

      const { data: stmtHeader, error: stmtErr } = await supabase
        .from('bank_statements')
        .insert({
          business_id: business.id,
          bank_account_id: activeAccount.id,
          source_file_url: fileUrl || file.name,
          file_type: file.name.split('.').pop()?.toLowerCase(),
          statement_period_start: statementData.startDate,
          statement_period_end: statementData.endDate,
          opening_balance: statementData.openingBalance,
          closing_balance: statementData.closingBalance,
          uploaded_by: user?.id,
          processing_status: 'completed'
        })
        .select()
        .single();

      if (stmtErr || !stmtHeader) throw new Error(`Statement header creation failed: ${stmtErr?.message}`);

      const txsToInsert = [...clean, ...flagged].map(res => ({
        business_id: business.id,
        import_id: stmtHeader.id,
        bank_account_id: activeAccount.id,
        transaction_date: res.transaction.date,
        description: res.transaction.description,
        normalized_description: res.transaction.normalized_description,
        reference_number: res.transaction.reference,
        debit: res.transaction.debit,
        credit: res.transaction.credit,
        amount: res.transaction.amount,
        balance: res.transaction.balance,
        transaction_hash: res.transaction.transaction_hash,
        reconciliation_status: 'unmatched',
        confidence_score: res.confidence
      }));

      let insertedIds: string[] = [];
      if (txsToInsert.length > 0) {
        const { data: insertedTxs, error: insertErr } = await supabase
          .from('bank_transactions')
          .upsert(txsToInsert, { onConflict: 'business_id, transaction_hash' })
          .select('id');

        if (insertErr) throw new Error(`Ingestion failed: ${insertErr.message}`);
        insertedIds = insertedTxs?.map(t => t.id) || [];
      }

      if (insertedIds.length > 0) {
        const suggestions = await matchBankTransactions(business.id, insertedIds);
        if (suggestions.length > 0) {
          await supabase.from('transaction_matches').insert(
            suggestions.map(s => ({
              business_id: business.id,
              bank_transaction_id: s.bankTransactionId,
              source_type: s.sourceType,
              source_record_id: s.sourceId,
              match_reason: s.matchReason,
              approved: false
            }))
          );
        }
      }

      if (statementData.closingBalance) {
        await supabase.from('bank_accounts')
          .update({ current_balance: statementData.closingBalance })
          .eq('id', activeAccount.id);
      }

      setSuccess(`✓ ${clean.length} transactions imported · ${duplicates.length} duplicates skipped · ${flagged.length} flagged`);
      fetchData(activeAccount.id);
    } catch (err: any) {
      setError(err.message || 'Import failed. Please check your file format.');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleConfirmMatch = async (txId: string, match: any) => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const formattedMatch: MatchSuggestion = {
        bankTransactionId: match.bank_transaction_id,
        sourceType: match.source_type,
        sourceId: match.source_record_id,
        confidence: match.confidence || 0,
        matchReason: match.match_reason || 'Manual match'
      };
      await approveReconciliation(business.id, txId, formattedMatch, user?.id || '');
      setSuccess('Match approved and posted to General Ledger.');
      fetchData(activeAccount?.id);
    } catch (err: any) {
      setError(err.message || 'Failed to approve match.');
      setLoading(false);
    }
  };

  const handleIgnore = async (txId: string) => {
    setLoading(true);
    try {
      await supabase.from('bank_transactions').update({ reconciliation_status: 'ignored' }).eq('id', txId);
      setSuccess('Transaction ignored.');
      fetchData(activeAccount?.id);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const hasTransactions = transactions.length > 0;

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* ── Header ── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Banking</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">
            Financial Institutions &amp; Statement Reconciliation
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600">
          <FileText size={14} className="text-primary" />
          <span>PDF · XLSX · CSV supported</span>
        </div>
      </header>

      {/* ── Notification Banners ── */}
      {error && (
        <div className="flex items-center gap-3 text-rose-400 text-xs font-mono bg-rose-500/10 px-4 py-3 rounded-xl border border-rose-500/20 mb-6">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 text-emerald-400 text-xs font-mono bg-emerald-500/10 px-4 py-3 rounded-xl border border-emerald-500/20 mb-6">
          <CheckCircle size={14} className="flex-shrink-0" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* ── Bank Account Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        {loading && accounts.length === 0 && [0, 1].map(i => (
          <div key={i} className="bg-surface border border-border-subtle p-6 rounded-2xl h-44">
            <Skeleton className="w-24 h-3 mb-4" />
            <Skeleton className="w-full h-7 mb-6" />
            <Skeleton className="w-32 h-3" />
          </div>
        ))}

        {accounts.map(account => (
          <div
            key={account.id}
            onClick={() => setActiveAccount(account)}
            className={`relative overflow-hidden bg-surface border p-6 rounded-2xl cursor-pointer group transition-all hover:border-primary/50 ${
              activeAccount?.id === account.id
                ? 'border-primary ring-1 ring-primary/20 shadow-lg shadow-primary/5'
                : 'border-border-subtle'
            }`}
          >
            <div className="flex justify-between items-start mb-5">
              <div>
                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-[0.2em] font-bold mb-1">{account.bank_name}</p>
                <h3 className="font-display text-lg font-bold text-white uppercase tracking-tight">{account.account_type || 'Account'}</h3>
              </div>
              <div className="size-9 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[18px]">account_balance_wallet</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mb-1">Account</p>
                <p className="font-mono text-lg text-white tracking-[0.1em] font-medium">
                  {account.account_number?.replace(/.(?=.{4})/g, '•') || '—'}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {account.branch_code && (
                    <div>
                      <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mb-0.5">Branch</p>
                      <p className="font-mono text-xs text-slate-300 font-bold">{account.branch_code}</p>
                    </div>
                  )}
                  {account.is_designated_cash_account && (
                    <div className="bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      <p className="text-[8px] font-mono text-primary uppercase tracking-widest font-bold">Primary</p>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mb-0.5">Balance</p>
                  <p className="font-mono text-sm text-emerald-400 font-bold">{fmt(account.current_balance || 0)}</p>
                </div>
              </div>
            </div>

            <div className="absolute top-0 right-0 w-28 h-28 bg-primary/5 rounded-full -mr-14 -mt-14 blur-3xl pointer-events-none" />
          </div>
        ))}
      </div>

      {/* ── Main Content: Upload or Dashboard ── */}
      {activeAccount ? (
        <div>
          {loading && !uploadLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="bg-surface border border-border-subtle p-5 rounded-2xl h-24">
                  <Skeleton className="w-16 h-3 mb-3" />
                  <Skeleton className="w-24 h-6" />
                </div>
              ))}
            </div>
          ) : hasTransactions ? (
            <FinancialsDashboard
              transactions={transactions}
              matches={matches}
              ledgerBalance={ledgerBalance}
              bankBalance={activeAccount.current_balance || 0}
              loading={loading}
              onConfirmMatch={handleConfirmMatch}
              onIgnore={handleIgnore}
              onCreateExpense={tx => { setSelectedTx(tx); setExpenseModalOpen(true); }}
              onUploadAnother={processFile}
              uploadLoading={uploadLoading}
            />
          ) : (
            <div className="mt-4">
              <div className="mb-4">
                <h2 className="font-display text-2xl font-bold text-white tracking-tight">
                  Statement Import — <span className="text-primary">{activeAccount.bank_name}</span>
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  Upload a bank statement to extract transactions and generate your financial dashboard.
                </p>
              </div>
              <UploadZone onFile={processFile} loading={uploadLoading} />
            </div>
          )}
        </div>
      ) : !loading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-surface/20 border border-border-subtle rounded-3xl border-dashed p-12 mt-8 animate-in zoom-in-95 duration-500">
          <div className="size-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 shadow-[0_0_40px_rgba(var(--color-primary),0.2)]">
            <span className="material-symbols-outlined text-primary text-[40px]">account_balance</span>
          </div>
          <h2 className="text-3xl font-display font-bold text-white mb-3 tracking-tight">No Bank Accounts Found</h2>
          <p className="text-slate-400 text-base max-w-lg text-center mb-10 leading-relaxed">
            You don't have any bank accounts set up yet. Once you connect an account or upload a statement, your financial dashboard will appear here.
          </p>
          <button 
            disabled={true}
            className="bg-primary text-black font-bold text-sm uppercase tracking-widest px-10 py-4 rounded-xl opacity-50 cursor-not-allowed shadow-[0_0_30px_rgba(var(--color-primary),0.3)] flex items-center gap-3"
          >
            <PlusCircle size={18} />
            Add Account (Coming Soon)
          </button>
        </div>
      ) : null}

      {/* ── Expense Modal ── */}
      {expenseModalOpen && selectedTx && business && (
        <ExpenseCreationModal
          isOpen={expenseModalOpen}
          onClose={() => { setExpenseModalOpen(false); setSelectedTx(null); }}
          transaction={selectedTx}
          businessId={business.id}
          onSuccess={() => {
            setSuccess('Expense created and matched.');
            fetchData(activeAccount?.id);
          }}
        />
      )}
    </div>
  );
}
