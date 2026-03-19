import { useAuth } from '../components/AuthProvider';

export default function Reconciliation() {
  const { business } = useAuth();

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Sync</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Bank Reconciliation & Clearing</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all">
            <span className="material-symbols-outlined text-[20px]">sync</span>
          </button>
        </div>
      </header>

      {/* Reconciliation Pulse */}
      <div className="bg-surface border border-border-subtle p-8 rounded-3xl relative overflow-hidden group mb-8">
         <div className="relative z-10 flex flex-col items-center text-center py-10">
            <div className="size-24 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 relative">
               <span className="material-symbols-outlined text-4xl text-primary animate-pulse">compare_arrows</span>
               <div className="absolute inset-0 rounded-full border border-primary/40 animate-ping opacity-20" />
            </div>
            <h2 className="font-display text-2xl font-bold text-white mb-2">Automated Matching</h2>
            <p className="text-slate-500 text-sm max-w-xs leading-relaxed mb-8">
              Zande AI is analyzing your bank statements and matching them with invoices and expenses.
            </p>
            <div className="flex gap-4">
               <div className="bg-surface-muted px-4 py-2 rounded-xl border border-border-subtle">
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold">Unmatched</p>
                  <p className="font-mono text-lg text-white font-bold">0</p>
               </div>
               <div className="bg-surface-muted px-4 py-2 rounded-xl border border-border-subtle">
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold">Suggestions</p>
                  <p className="font-mono text-lg text-primary font-bold">0</p>
               </div>
            </div>
         </div>
      </div>

      {/* Pending Items List */}
      <div className="space-y-4">
         <div className="flex items-center justify-between px-2">
            <h3 className="font-display text-xs font-bold tracking-[0.2em] text-slate-500 uppercase">Recent Activity for {business?.name || 'Business'}</h3>
            <span className="text-[9px] font-mono text-primary font-bold tracking-widest uppercase">View All</span>
         </div>
         
         <div className="flex flex-col items-center justify-center py-12 text-center opacity-40 grayscale">
            <div className="size-16 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mb-4">
               <span className="material-symbols-outlined text-3xl text-slate-600">history</span>
            </div>
            <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">No recent sync activity</p>
         </div>
      </div>
    </div>
  );
}
