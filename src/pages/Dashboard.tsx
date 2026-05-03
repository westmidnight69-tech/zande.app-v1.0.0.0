import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Header from '../components/Header';
import { Skeleton, StatSkeleton } from '../components/Skeleton';
import { useAuth } from '../components/AuthProvider';

interface DashboardStats {
  totalRevenue: number;
  totalOutstanding: number;
  totalExpenses: number;
  draftsTotal: number;
  paidCount: number;
  overdueCount: number;
  clientCount: number;
  revenueTrend: { percentage: number; isIncrease: boolean } | null;
  expenseTrend: { percentage: number; isIncrease: boolean } | null;
}

function StatusCard({ label, value, colorClass, loading, trend }: { 
  label: string; 
  value: string; 
  colorClass: string; 
  loading?: boolean;
  trend?: { percentage: number; isIncrease: boolean } | null;
}) {
  if (loading) return <StatSkeleton />;
  return (
    <div className={`bg-surface border border-border-subtle p-5 rounded-xl relative overflow-hidden group hover:border-border-subtle/80 transition-all`}>
      <div className="flex justify-between items-start mb-1">
        <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">{label}</p>
        {trend && (
          <div className={`flex items-center gap-0.5 font-mono text-[9px] font-bold ${
            (label === 'Expenses' ? trend.isIncrease : !trend.isIncrease) 
            ? 'text-status-overdue'   // Red if expenses increase OR revenue decrease
            : 'text-status-collected' // Green if expenses decrease OR revenue increase
          }`}>
            <span className="material-symbols-outlined text-[12px]">
              {trend.isIncrease ? 'north' : 'south'}
            </span>
            {trend.percentage}%
          </div>
        )}
      </div>
      <p className={`font-mono text-lg font-bold text-slate-100`}>{value}</p>
      <div className={`absolute bottom-0 left-0 right-0 h-1 ${colorClass} opacity-80`} />
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { business } = useAuth();

  const fetchStats = useCallback(async () => {
      if (!business?.id) return;
      setLoading(true);
      
      const now = new Date();
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

      // Parallel fetch for consolidated data
      const [
        expensesResult, 
        paymentsResult,
        clientsCountResult,
        invoicesResult
      ] = await Promise.all([
        // Fetch expenses for both months in one go
        supabase.from('expenses').select('amount, expense_date').eq('business_id', business.id).gte('expense_date', firstOfLastMonth).lte('expense_date', lastOfThisMonth),
        // Fetch payments for both months in one go
        supabase.from('payments').select('amount, payment_date').eq('business_id', business.id).gte('payment_date', firstOfLastMonth).lte('payment_date', lastOfThisMonth),
        // Keep clients count as is (it's a fast head request)
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('is_active', true),
        // Consolidate all relevant invoices in one go
        supabase.from('invoices').select('amount_due, status, total').eq('business_id', business.id)
      ]);

      const sum = (arr: any[], key: string) => arr?.reduce((acc, curr) => acc + Number(curr[key] || 0), 0) || 0;

      // Filter expenses/payments in memory
      const expenses = expensesResult.data || [];
      const payments = paymentsResult.data || [];
      const allInvoices = invoicesResult.data || [];

      const totalExpensesThis = sum(expenses.filter(e => e.expense_date >= firstOfThisMonth), 'amount');
      const totalExpensesPrev = sum(expenses.filter(e => e.expense_date >= firstOfLastMonth && e.expense_date <= lastOfLastMonth), 'amount');
      
      const totalCollectedThis = sum(payments.filter(p => p.payment_date >= firstOfThisMonth), 'amount');
      const totalCollectedPrev = sum(payments.filter(p => p.payment_date >= firstOfLastMonth && p.payment_date <= lastOfLastMonth), 'amount');

      const activeInvoices = allInvoices.filter(i => !['PAID', 'SETTLED', 'VOID', 'DRAFT'].includes(i.status));
      const totalOutstanding = sum(activeInvoices, 'amount_due');
      const overdueCount = activeInvoices.filter(i => i.status === 'OVERDUE').length;
      const draftsTotal = sum(allInvoices.filter(i => i.status === 'DRAFT'), 'total');

      const calculateTrend = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? { percentage: 100, isIncrease: true } : null;
        const diff = ((current - previous) / previous) * 100;
        if (Math.abs(diff) < 0.1) return null;
        return { percentage: Math.abs(Math.round(diff)), isIncrease: diff >= 0 };
      };

      setStats({
        totalRevenue: totalCollectedThis,
        totalOutstanding,
        totalExpenses: totalExpensesThis,
        draftsTotal,
        paidCount: 0,
        overdueCount,
        clientCount: clientsCountResult.count ?? 0,
        revenueTrend: calculateTrend(totalCollectedThis, totalCollectedPrev),
        expenseTrend: calculateTrend(totalExpensesThis, totalExpensesPrev),
      });
      
      setLoading(false);
  }, [business?.id]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const fmt = useMemo(() => (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, []);

  return (
    <div className="pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Header />

      {/* Main Revenue Header */}
      <section className="mt-12 mb-10">
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] mb-3">Total Outstanding</p>
        {loading ? (
          <Skeleton className="w-64 h-16" />
        ) : (
          <div className="flex flex-col">
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-4">
              {fmt(stats?.totalOutstanding ?? 0)}
            </h1>
            <div className="flex gap-2">
              <span className="px-2.5 py-1 bg-status-overdue/10 text-status-overdue text-[10px] font-mono font-bold rounded uppercase">
                {stats?.overdueCount} Overdue
              </span>
              <span className="px-2.5 py-1 bg-surface-muted text-slate-500 text-[10px] font-mono font-bold rounded uppercase">
                {stats?.clientCount} Active Clients
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Stats Grid - 2x2 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <StatusCard 
          label="Collected" 
          value={fmt(stats?.totalRevenue ?? 0)} 
          colorClass="bg-status-collected" 
          loading={loading}
          trend={stats?.revenueTrend}
        />
        <StatusCard 
          label="Overdue" 
          value={fmt(stats?.totalOutstanding ?? 0)} 
          colorClass="bg-status-overdue" 
          loading={loading}
        />
        <StatusCard 
          label="Expenses" 
          value={fmt(stats?.totalExpenses ?? 0)} 
          colorClass="bg-status-expenses" 
          loading={loading}
          trend={stats?.expenseTrend}
        />
        <StatusCard 
          label="Drafts" 
          value={fmt(stats?.draftsTotal ?? 0)} 
          colorClass="bg-status-drafts" 
          loading={loading}
        />
      </section>

      {/* Bank Accounts Section */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4 px-1">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold text-lg">Bank Accounts</p>
          <button className="text-primary text-[10px] font-mono uppercase tracking-widest font-bold hover:underline">Manage</button>
        </div>
        
        {loading ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : (
          <div className="bg-surface/30 border border-border-subtle border-dashed p-8 rounded-2xl flex flex-col items-center justify-center text-center gap-3 group hover:border-primary/30 transition-all cursor-pointer">
            <div className="size-12 rounded-full bg-surface items-center justify-center flex text-slate-500 group-hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-2xl">add_card</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-300">No bank accounts linked</p>
              <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wider">Connect your bank for automated reconciliation</p>
            </div>
          </div>
        )}
      </section>

      {/* Quick Actions Row */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <button 
          onClick={() => navigate('/invoices')}
          className="flex flex-col items-center justify-center py-4 rounded-xl bg-surface border border-border-subtle hover:bg-surface-muted transition-all gap-2 group"
        >
          <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">add_box</span>
          <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-slate-400 group-hover:text-slate-200 text-center">New Invoice</span>
        </button>
        <button 
          onClick={() => navigate('/expenses')}
          className="flex flex-col items-center justify-center py-4 rounded-xl bg-surface border border-border-subtle hover:bg-surface-muted transition-all gap-2 group"
        >
          <span className="material-symbols-outlined text-status-expenses group-hover:scale-110 transition-transform">receipt_long</span>
          <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-slate-400 group-hover:text-slate-200 text-center">Add Expense</span>
        </button>
        <button 
          onClick={() => navigate('/documents')}
          className="flex flex-col items-center justify-center py-4 rounded-xl bg-surface border border-border-subtle hover:bg-surface-muted transition-all gap-2 group"
        >
          <span className="material-symbols-outlined text-slate-400 group-hover:scale-110 transition-transform">cloud_upload</span>
          <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-slate-400 group-hover:text-slate-200 text-center">Upload Receipt</span>
        </button>
      </section>
    </div>
  );
}
