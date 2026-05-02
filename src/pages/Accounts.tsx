import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AccountSectionSkeleton, Skeleton } from '../components/Skeleton';
import { useAuth } from '../components/AuthProvider';
import { ledgerService } from '../lib/ledger';
import { reconcile } from '../accounting/reconciliation';
import type { ReconciliationResult } from '../accounting/types';
import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownLeft, FileText, ShieldCheck, ShieldAlert } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'chart' | 'journal' | 'trial'>('chart');
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
        {(['chart', 'journal', 'trial'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg text-xs font-bold font-display tracking-wide transition-all ${
              activeTab === tab
                ? 'bg-surface text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'chart' ? 'Chart of Accounts' : tab === 'journal' ? 'Journal' : 'Trial Balance'}
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
