import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AccountSectionSkeleton } from '../components/Skeleton';
import { useAuth } from '../components/AuthProvider';

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

  useEffect(() => {
    async function fetchAccounts() {
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
    }
    fetchAccounts();
  }, []);

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
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Accounts</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">General Ledger & Setup</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </button>
        </div>
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

        {!loading && !error && activeTab !== 'chart' && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6 grayscale opacity-40">
            <div className="size-20 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-4xl text-slate-500">construction</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-100 mb-2">Development in progress</h2>
            <p className="text-slate-500 text-sm max-w-[200px] leading-relaxed">The {activeTab} section is being optimized for the Black Premium experience.</p>
          </div>
        )}
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
