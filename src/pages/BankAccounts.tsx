import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../components/AuthProvider';

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  branch_code: string;
  is_designated_cash_account: boolean;
}

export default function BankAccounts() {
  const { business } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAccounts() {
      if (!business?.id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('business_id', business.id);
      
      if (error) setError(error.message);
      else setAccounts(data || []);
      setLoading(false);
    }
    fetchAccounts();
  }, []);

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Banking</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Financial Institutions</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all">
            <span className="material-symbols-outlined text-[20px]">account_balance</span>
          </button>
        </div>
      </header>

      {/* Bank Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading && Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border-subtle p-6 rounded-2xl h-48">
            <Skeleton className="w-24 h-4 mb-4" />
            <Skeleton className="w-full h-8 mb-6" />
            <div className="flex gap-4">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-20 h-3" />
            </div>
          </div>
        ))}
        
        {error && (
          <div className="col-span-full p-4 rounded-xl bg-status-overdue/10 border border-status-overdue/30 text-status-overdue font-mono text-sm">
            {error}
          </div>
        )}

        {!loading && !error && accounts.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="size-20 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-4xl text-slate-700">museum</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-100 mb-2">
              No bank accounts linked
            </h2>
            <p className="text-slate-500 text-sm max-w-[200px] leading-relaxed mb-8">
              Connect your bank to enable automated reconciliation and transaction tracking.
            </p>
            <button className="flex items-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/5">
              <span className="material-symbols-outlined font-bold">add</span>
              Link Account
            </button>
          </div>
        )}

        {accounts.map(account => (
          <div key={account.id} className="bg-surface border border-border-subtle p-6 rounded-2xl relative overflow-hidden group hover:border-border-subtle/80 transition-all">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] font-bold mb-1">{account.bank_name}</p>
                <h3 className="font-display text-lg font-bold text-white uppercase tracking-tight">{account.account_type}</h3>
              </div>
              <div className="size-10 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[20px]">account_balance_wallet</span>
              </div>
            </div>
            
            <div className="space-y-4">
               <div>
                 <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest leading-none mb-1.5">Account Number</p>
                 <p className="font-mono text-xl text-white tracking-[0.1em] font-medium">
                   {account.account_number.replace(/.(?=.{4})/g, '•')}
                 </p>
               </div>
               
               <div className="flex items-center gap-6">
                 <div>
                   <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mb-0.5">Branch</p>
                   <p className="font-mono text-xs text-slate-300 font-bold">{account.branch_code}</p>
                 </div>
                 {account.is_designated_cash_account && (
                   <div className="bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                     <p className="text-[8px] font-mono text-primary uppercase tracking-widest font-bold">Primary</p>
                   </div>
                 )}
               </div>
            </div>
            
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
          </div>
        ))}
      </div>

      {/* Connection Status */}
      {!loading && accounts.length > 0 && (
         <div className="mt-8 p-4 bg-surface/30 border border-dashed border-border-subtle rounded-xl flex items-center justify-between group cursor-pointer hover:bg-surface/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">Bank Feed Status: Active</p>
            </div>
            <span className="material-symbols-outlined text-slate-700 group-hover:text-primary transition-colors">sync</span>
         </div>
      )}
    </div>
  );
}
