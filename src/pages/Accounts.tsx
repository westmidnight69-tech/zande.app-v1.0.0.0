import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AccountSectionSkeleton, Skeleton } from '../components/Skeleton';
import { useAuth } from '../components/AuthProvider';
import { ledgerService } from '../lib/ledger';
import { reconcile } from '../accounting/reconciliation';
import type { ReconciliationResult } from '../accounting/types';
import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownLeft, FileText, ShieldCheck, ShieldAlert, UploadCloud, CheckCircle, PlusCircle, BarChart2 } from 'lucide-react';
import { parseAndValidateBankStatement, matchBankTransactions, approveReconciliation } from '../accounting/bankReconciliation';
import type { MatchSuggestion } from '../accounting/bankReconciliation';
import ExpenseCreationModal from '../components/accounting/ExpenseCreationModal';

interface Account {
  id: string;
  account_code: string | null;
  name: string | null;
  type: string | null;
}

interface AccountSection {
  label: string;
  prefix: string;
  color: string;
}

const SECTIONS: AccountSection[] = [
  { label: 'ASSETS', prefix: '1', color: 'bg-primary' },
  { label: 'LIABILITIES', prefix: '2', color: 'bg-status-overdue' },
  { label: 'EQUITY', prefix: '3', color: 'bg-status-drafts' },
  { label: 'INCOME', prefix: '4', color: 'bg-status-collected' },
  { label: 'EXPENSES', prefix: '5', color: 'bg-status-expenses' },
];

export default function Accounts() {
  const { business } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chart' | 'journal' | 'trial' | 'statements'>('chart');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['1', '4']));
  
  // Reconciliation State
  const [recon, setRecon] = useState<ReconciliationResult | null>(null);
  const [, setReconLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('accounts')
      .select('id, account_code, name, type')
      .eq('business_id', business.id)
      .order('account_code', { ascending: true });
    if (error) setError(error.message);
    else setAccounts(data || []);
    setLoading(false);
  }, [business?.id]);

  const runReconciliation = useCallback(async () => {
    if (!business?.id) return;
    setReconLoading(true);
    try {
      const result = await reconcile(business.id);
      setRecon(result);
    } catch (err) {
      console.error('Reconciliation failed:', err);
    } finally {
      setReconLoading(false);
    }
  }, [business?.id]);

  useEffect(() => {
    fetchAccounts();
    runReconciliation();
  }, [fetchAccounts, runReconciliation]);

  function toggleSection(prefix: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  }

  const getSectionPrefix = (code: string | null) => code?.charAt(0) ?? '';

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Accounts</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">General Ledger & Setup</p>
        </div>
        
        {/* Integrity Badge */}
        {recon && (
          <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${
            recon.is_balanced 
              ? 'bg-emerald-500/5 border-emerald-500/20' 
              : 'bg-rose-500/5 border-rose-500/20'
          }`}>
            <div className={`size-8 rounded-full flex items-center justify-center ${
              recon.is_balanced ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
            }`}>
              {recon.is_balanced ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
            </div>
            <div>
              <p className="text-[9px] font-mono text-slate-500 uppercase font-bold leading-tight">System Integrity</p>
              <p className={`text-[10px] font-mono font-bold ${recon.is_balanced ? 'text-emerald-400' : 'text-rose-400'}`}>
                {recon.is_balanced ? 'LEDGER BALANCED' : `OUT OF SYNC (Δ R${recon.delta})`}
              </p>
            </div>
            {!recon.is_balanced && (
               <button 
                 onClick={runReconciliation}
                 className="ml-2 text-[10px] font-mono text-slate-400 underline hover:text-slate-200"
               >
                 RECHECK
               </button>
            )}
          </div>
        )}
      </header>

      {/* Tabs */}
      <nav className="flex gap-1 mb-10 bg-surface/50 p-1 rounded-xl border border-border-subtle overflow-x-auto no-scrollbar">
        {(['chart', 'journal', 'trial', 'statements'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-bold font-display tracking-wide transition-all ${
              activeTab === tab
                ? 'bg-surface text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'chart' ? 'Chart of Accounts' : tab === 'journal' ? 'Journal' : tab === 'trial' ? 'Trial Balance' : 'Bank Statements'}
          </button>
        ))}
      </nav>

      <div className="flex-1">
        {loading && <div className="space-y-4">{SECTIONS.map(s => <AccountSectionSkeleton key={s.prefix} />)}</div>}
        
        {error && (
          <div className="p-4 rounded-xl bg-status-overdue/10 border border-status-overdue/30 text-status-overdue font-mono text-sm">
            {error}
          </div>
        )}

        {!loading && !error && activeTab === 'chart' && (
          <div className="space-y-4">
            {SECTIONS.map(section => {
              const sectionAccounts = accounts.filter(a => getSectionPrefix(a.account_code) === section.prefix);
              const isOpen = openSections.has(section.prefix);
              
              if (sectionAccounts.length === 0) return null;

              return (
                <div key={section.prefix} className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden group">
                  <button
                    onClick={() => toggleSection(section.prefix)}
                    className="w-full flex items-center px-6 py-4 hover:bg-surface/50 transition-colors"
                  >
                    <span className={`material-symbols-outlined text-[20px] mr-3 transition-transform duration-300 ${isOpen ? 'rotate-90 text-primary' : 'text-slate-600'}`}>
                      chevron_right
                    </span>
                    <span className="font-display text-xs font-bold tracking-[0.15em] text-slate-400 group-hover:text-slate-200 uppercase">
                      {section.label}
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                      <span className="font-mono text-[10px] text-slate-600 font-bold group-hover:text-slate-400">
                        {sectionAccounts.length} ACCOUNTS
                      </span>
                      <div className={`size-1.5 rounded-full ${section.color}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-2 pb-4 space-y-1 animate-in slide-in-from-top-2 duration-200">
                      {sectionAccounts.map(account => (
                        <div key={account.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface transition-all group/item">
                          <div className="w-12 font-mono text-[11px] font-bold text-slate-600 group-hover/item:text-primary transition-colors">
                            {account.account_code}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-slate-100 group-hover/item:text-white truncate">
                              {account.name}
                            </h4>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500 bg-surface-muted px-2 py-0.5 rounded border border-border-subtle">
                              {account.type}
                            </span>
                          </div>
                          <span className="material-symbols-outlined text-[18px] text-slate-800 opacity-0 group-hover/item:opacity-100 transition-all group-hover/item:text-slate-500">
                            more_vert
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'journal' && <Journal businessId={business?.id || ''} />}
        {activeTab === 'trial' && <TrialBalance businessId={business?.id || ''} />}
        {activeTab === 'statements' && <BankStatements businessId={business?.id || ''} />}
      </div>

      {/* FAB */}
      <div className="fixed bottom-24 right-6 lg:bottom-12 lg:right-12 z-50">
        <button className="size-16 bg-white text-black rounded-full flex items-center justify-center shadow-2xl shadow-white/10 hover:scale-110 active:scale-95 transition-all">
          <span className="material-symbols-outlined text-4xl font-bold">add</span>
        </button>
      </div>
    </div>
  );
}
function Journal({ businessId }: { businessId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!businessId) return;
      const data = await ledgerService.getJournalEntries(businessId);
      setEntries(data || []);
      setLoading(false);
    }
    load();
  }, [businessId]);

  if (loading) return <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div className="space-y-6">
      {entries.map((tx) => (
        <div key={tx.id} className="bg-surface border border-border-subtle rounded-xl overflow-hidden group">
          <div className="bg-surface-muted px-4 py-2 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{format(new Date(tx.created_at), 'dd MMM yyyy HH:mm')}</span>
              <span className="size-1 rounded-full bg-slate-800" />
              <span className="text-[10px] font-mono text-primary uppercase tracking-widest font-bold">{tx.reference_type} #{tx.reference_id?.slice(0,8)}</span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 italic">"{tx.description}"</p>
          </div>
          <div className="p-0">
            {tx.ledger_entries.map((entry: any) => (
              <div key={entry.id} className="flex items-center gap-4 px-4 py-3 hover:bg-surface/50 transition-colors border-b border-border-subtle/30 last:border-0">
                <div className={`size-8 rounded flex items-center justify-center ${entry.debit > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                  {entry.debit > 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-100 truncate">{entry.accounts.name}</p>
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{entry.accounts.account_code}</p>
                </div>
                <div className="w-24 text-right">
                  {entry.debit > 0 && <p className="font-mono text-xs font-bold text-emerald-500">+{entry.debit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>}
                  {entry.credit > 0 && <p className="font-mono text-xs font-bold text-red-500">-{entry.credit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {entries.length === 0 && (
        <div className="text-center py-20 text-slate-500 font-mono text-xs grayscale opacity-40">
          <FileText className="mx-auto mb-4 opacity-20" size={48} />
          NO JOURNAL ENTRIES RECORDED
        </div>
      )}
    </div>
  );
}

function TrialBalance({ businessId }: { businessId: string }) {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!businessId) return;
      const data = await ledgerService.getTrialBalance(businessId);
      setBalances(data || []);
      setLoading(false);
    }
    load();
  }, [businessId]);

  const totals = balances.reduce((acc, curr) => ({
    debit: acc.debit + (curr.debit || 0),
    credit: acc.credit + (curr.credit || 0)
  }), { debit: 0, credit: 0 });

  if (loading) return <div className="space-y-4">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface-muted">
            <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Account</th>
            <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold text-right">Debit</th>
            <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold text-right">Credit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle/30">
          {balances.map((row) => (
            <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors">
              <td className="px-6 py-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-100">{row.name}</span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{row.account_code}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-right font-mono text-xs text-emerald-500">
                {row.debit > 0 ? row.debit.toLocaleString('en-ZA', { minimumFractionDigits: 2 }) : '-'}
              </td>
              <td className="px-6 py-4 text-right font-mono text-xs text-red-500">
                {row.credit > 0 ? row.credit.toLocaleString('en-ZA', { minimumFractionDigits: 2 }) : '-'}
              </td>
            </tr>
          ))}
          <tr className="bg-surface-muted/50 font-bold border-t-2 border-border-subtle">
            <td className="px-6 py-6 text-xs text-white uppercase tracking-widest">Totals</td>
            <td className="px-6 py-6 text-right font-mono text-sm text-emerald-400">
              {totals.debit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
            </td>
            <td className="px-6 py-6 text-right font-mono text-sm text-red-400">
              {totals.credit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>
      {totals.debit !== totals.credit && (
        <div className="p-4 bg-status-overdue/10 border-t border-status-overdue/30 text-status-overdue text-center text-[10px] font-mono uppercase tracking-widest font-bold">
          ⚠️ Warning: Ledger is out of balance by {(totals.debit - totals.credit).toFixed(2)}
        </div>
      )}
    </div>
  );
}

function BankStatements({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bankAccount, setBankAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modal State
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Get or create bank account for this business
      let { data: accounts, error: accErr } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('business_id', businessId)
        .limit(1);

      if (accErr) throw accErr;

      let activeAcc = accounts?.[0];
      if (!activeAcc) {
        // Seed a default bank account if none exists
        const { data: newAcc, error: seedErr } = await supabase
          .from('bank_accounts')
          .insert({
            business_id: businessId,
            bank_name: 'Primary Business Bank',
            account_name: 'Main Transactional Account',
            account_number_masked: '•••• 1234',
            opening_balance: 0,
            current_balance: 0
          })
          .select()
          .single();

        if (seedErr) throw seedErr;
        activeAcc = newAcc;
      }
      setBankAccount(activeAcc);

      // 2. Fetch unreconciled bank transactions
      const { data: txs, error: txsErr } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('bank_account_id', activeAcc.id)
        .neq('reconciliation_status', 'approved')
        .order('transaction_date', { ascending: false });

      if (txsErr) throw txsErr;
      setTransactions(txs || []);

      // 3. Fetch matched details for these transactions
      if (txs && txs.length > 0) {
        const { data: mData, error: mErr } = await supabase
          .from('reconciliation_matches')
          .select('*')
          .in('bank_transaction_id', txs.map(t => t.id));

        if (mErr) throw mErr;
        setMatches(mData || []);
      } else {
        setMatches([]);
      }

      // 4. Fetch Bank ledger balance (Code 1000)
      const balances = await ledgerService.getTrialBalance(businessId);
      const bankLedger = balances.find(b => b.code === '1000');
      setLedgerBalance(bankLedger?.balance || 0);

    } catch (err: any) {
      setError(err.message || 'Failed to load bank reconciliation data.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bankAccount) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Parse & Validate statement (Opening + Credits - Debits = Closing)
      const parsed = await parseAndValidateBankStatement(file, businessId, bankAccount.id);

      // Save Statement Import Header
      const { data: importHeader, error: importErr } = await supabase
        .from('bank_statement_imports')
        .insert({
          business_id: businessId,
          bank_account_id: bankAccount.id,
          file_name: file.name,
          statement_start_date: parsed.startDate,
          statement_end_date: parsed.endDate,
          opening_balance: parsed.openingBalance,
          closing_balance: parsed.closingBalance,
          uploaded_by: user?.id,
          status: 'processing'
        })
        .select()
        .single();

      if (importErr || !importHeader) throw new Error(`Import header creation failed: ${importErr?.message}`);

      // Save transactions (using upsert with onConflict transaction_hash to skip existing)
      const txsToInsert = parsed.rows.map(row => ({
        business_id: businessId,
        import_id: importHeader.id,
        bank_account_id: bankAccount.id,
        transaction_date: row.transaction_date,
        description: row.description,
        reference_number: row.reference_number,
        debit: row.debit,
        credit: row.credit,
        balance: row.balance,
        transaction_hash: row.transaction_hash,
        reconciliation_status: 'unmatched'
      }));

      const { data: insertedTxs, error: insertErr } = await supabase
        .from('bank_transactions')
        .upsert(txsToInsert, { onConflict: 'business_id, transaction_hash' })
        .select();

      if (insertErr) throw new Error(`Transaction ingestion failed: ${insertErr.message}`);

      // Run matching engine on newly ingested transactions
      if (insertedTxs && insertedTxs.length > 0) {
        const matchSuggestions = await matchBankTransactions(businessId, insertedTxs.map(t => t.id));
        
        if (matchSuggestions.length > 0) {
          const suggestionsToInsert = matchSuggestions.map(s => ({
            business_id: businessId,
            bank_transaction_id: s.bankTransactionId,
            source_type: s.sourceType,
            source_id: s.sourceId,
            confidence: s.confidence,
            match_method: s.matchMethod,
            approved: false
          }));

          await supabase.from('reconciliation_matches').insert(suggestionsToInsert);
        }
      }

      // Update import status
      await supabase
        .from('bank_statement_imports')
        .update({ status: 'completed' })
        .eq('id', importHeader.id);

      // Update Bank Account Current Balance to latest statement closing balance
      await supabase
        .from('bank_accounts')
        .update({ current_balance: parsed.closingBalance })
        .eq('id', bankAccount.id);

      setSuccess(`Import successful! ${parsed.rows.length} transactions processed.`);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Import failed.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleConfirmMatch = async (txId: string, match: any) => {
    setLoading(true);
    setError(null);
    try {
      const formattedMatch: MatchSuggestion = {
        bankTransactionId: match.bank_transaction_id,
        sourceType: match.source_type,
        sourceId: match.source_id,
        confidence: match.confidence,
        matchMethod: match.match_method,
        description: match.description || 'System match suggestion'
      };

      await approveReconciliation(businessId, txId, formattedMatch, user?.id || '');
      setSuccess('Match successfully approved and posted to General Ledger.');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to approve match.');
    } finally {
      setLoading(false);
    }
  };

  const handleIgnore = async (txId: string) => {
    setLoading(true);
    try {
      await supabase
        .from('bank_transactions')
        .update({ reconciliation_status: 'ignored' })
        .eq('id', txId);
      
      setSuccess('Transaction marked as ignored.');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Metrics Dashboard calculations
  const totalDeposits = transactions.reduce((sum, t) => sum + Number(t.credit || 0), 0);
  const totalWithdrawals = transactions.reduce((sum, t) => sum + Number(t.debit || 0), 0);
  const netMovement = totalDeposits - totalWithdrawals;

  const approvedCount = transactions.filter(t => t.reconciliation_status === 'approved').length;
  const totalCount = transactions.length;
  const reconciliationRate = totalCount > 0 ? (approvedCount / totalCount) * 100 : 0;

  // Validation comparison
  const bankCurrentBalance = bankAccount?.current_balance || 0;
  const balanceDifference = Math.abs(bankCurrentBalance - ledgerBalance);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Integrity & Discrepancy Checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`p-6 rounded-2xl border ${
          balanceDifference < 0.05
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-yellow-500/5 border-yellow-500/20'
        }`}>
          <div className="flex items-center gap-3">
            <ShieldCheck className={balanceDifference < 0.05 ? 'text-emerald-500' : 'text-yellow-500'} size={24} />
            <div>
              <p className="text-[10px] font-mono text-slate-500 uppercase font-bold">Bank vs Ledger Balance Check</p>
              <h4 className="text-sm font-bold text-slate-200 mt-1">
                {balanceDifference < 0.05 
                  ? 'Balances In Sync' 
                  : `Discrepancy: R${balanceDifference.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                }
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Bank Current Balance: R{bankCurrentBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} | Ledger Bank Account: R{ledgerBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface/30 border border-border-subtle p-6 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart2 className="text-primary" size={24} />
            <div>
              <p className="text-[10px] font-mono text-slate-500 uppercase font-bold">Statement Reconciliation Rate</p>
              <h4 className="text-sm font-bold text-slate-200 mt-1">{reconciliationRate.toFixed(0)}% Complete</h4>
              <div className="w-48 bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                <div className="bg-primary h-full transition-all duration-500" style={{ width: `${reconciliationRate}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border-subtle p-5 rounded-2xl">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Total Deposits</p>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-2">R{totalDeposits.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-surface border border-border-subtle p-5 rounded-2xl">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Total Withdrawals</p>
          <p className="text-xl font-bold font-mono text-slate-200 mt-2">R{totalWithdrawals.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-surface border border-border-subtle p-5 rounded-2xl">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Net Cash Flow</p>
          <p className={`text-xl font-bold font-mono mt-2 ${netMovement >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            R{netMovement.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-surface border border-border-subtle p-5 rounded-2xl">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Pending Rows</p>
          <p className="text-xl font-bold font-mono text-primary mt-2">{transactions.length}</p>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-8 text-center flex flex-col items-center justify-center border-dashed">
         <UploadCloud className="text-slate-500 mb-4" size={48} />
         <h3 className="text-lg font-bold text-slate-200 mb-2 font-display">Upload Bank Statement</h3>
         <p className="text-sm text-slate-500 mb-6 max-w-md">
           Import your bank statement in Excel (.xlsx, .xls, .csv) format. The ledger balance will only update once transactions are explicitly approved.
         </p>
         <label className="bg-primary text-black font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-lg hover:bg-primary/90 cursor-pointer transition-colors flex items-center gap-2">
           {loading ? 'Processing...' : 'Choose File'}
           <input 
             type="file" 
             className="hidden" 
             accept=".xlsx, .xls, .csv" 
             onChange={handleFileUpload} 
             disabled={loading}
           />
         </label>
         {error && <p className="text-rose-500 mt-4 text-xs font-mono bg-rose-500/10 px-4 py-2 rounded border border-rose-500/20">{error}</p>}
         {success && <p className="text-emerald-500 mt-4 text-xs font-mono bg-emerald-500/10 px-4 py-2 rounded border border-emerald-500/20">{success}</p>}
      </div>

      {/* Transactions Grid */}
      {transactions.length > 0 && (
        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
           <div className="bg-surface-muted px-6 py-4 border-b border-border-subtle flex justify-between items-center">
             <h3 className="font-display font-bold text-slate-100 text-sm">Unreconciled Bank Transactions</h3>
             <span className="bg-primary/10 text-primary text-[10px] font-mono font-bold px-2 py-1 rounded">{transactions.length} PENDING</span>
           </div>
           
           <div className="divide-y divide-border-subtle/30 max-h-[600px] overflow-y-auto no-scrollbar">
             {transactions.map((tx) => {
               // Get match suggestion for this transaction
               const match = matches.find(m => m.bank_transaction_id === tx.id);

               return (
                 <div key={tx.id} className="p-6 hover:bg-surface/50 transition-colors">
                   <div className="flex justify-between items-start mb-3">
                     <div>
                       <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{format(new Date(tx.transaction_date), 'dd MMM yyyy')}</span>
                       <p className="text-sm font-bold text-slate-200 mt-1">{tx.description}</p>
                       {tx.reference_number && (
                         <p className="text-[10px] font-mono text-slate-500 mt-0.5">Ref: {tx.reference_number}</p>
                       )}
                     </div>
                     <div className={`text-right font-mono font-bold text-sm ${tx.credit > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                       {tx.credit > 0 
                         ? `+R${Number(tx.credit).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` 
                         : `-R${Number(tx.debit).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                       }
                     </div>
                   </div>
                   
                   {/* Suggestion Card & Actions */}
                   <div className="mt-4 pt-4 border-t border-border-subtle/30 flex items-center justify-between flex-wrap gap-4">
                      {match ? (
                        <div className="flex-1 min-w-[280px] flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-xl">
                           <div className="flex items-center gap-3">
                             <CheckCircle className="text-emerald-500 flex-shrink-0" size={18} />
                             <div>
                               <p className="text-[9px] text-emerald-500/70 uppercase font-mono font-bold mb-0.5">
                                 Suggested Match ({match.confidence}%)
                               </p>
                               <p className="text-xs text-emerald-400 font-bold">{match.source_type === 'invoice' ? 'Invoice Match' : 'Expense Match'}</p>
                             </div>
                           </div>
                           <button 
                             onClick={() => handleConfirmMatch(tx.id, match)}
                             disabled={loading}
                             className="bg-emerald-500 text-black px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                           >
                             Confirm Match
                           </button>
                        </div>
                      ) : (
                        <div className="flex-1 text-xs text-slate-500 font-mono italic">No automated match found.</div>
                      )}
                      
                      <div className="flex gap-2">
                        {tx.debit > 0 && (
                          <button 
                            onClick={() => {
                              setSelectedTx(tx);
                              setExpenseModalOpen(true);
                            }}
                            disabled={loading}
                            className="flex items-center gap-2 bg-surface-muted text-slate-300 border border-border-subtle hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                          >
                            <PlusCircle size={14} /> New Expense
                          </button>
                        )}
                        <button 
                          onClick={() => handleIgnore(tx.id)}
                          className="flex items-center gap-2 bg-surface-muted text-slate-500 border border-border-subtle hover:text-rose-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                        >
                          Ignore
                        </button>
                      </div>
                   </div>
                 </div>
               );
             })}
           </div>
        </div>
      )}

      {expenseModalOpen && selectedTx && (
        <ExpenseCreationModal
          isOpen={expenseModalOpen}
          onClose={() => {
            setExpenseModalOpen(false);
            setSelectedTx(null);
          }}
          transaction={selectedTx}
          businessId={businessId}
          onSuccess={() => {
            setSuccess('Expense created and matched successfully.');
            fetchData();
          }}
        />
      )}
    </div>
  );
}
