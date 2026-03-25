import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie
} from 'recharts';
import { useAuth } from '../components/AuthProvider';

// Types for analytics
interface ChartData {
  month: string;
  revenue: number;
  expenses: number;
}

const COLORS = ['#0ea5e9', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'];

export default function Reports() {
  const { business } = useAuth();
  const [analyticsData, setAnalyticsData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    margin: 0,
    categorySplit: [] as { name: string; value: number }[],
    topSellingItems: [] as { name: string; value: number }[]
  });

  const fetchAnalytics = async () => {
    if (!business?.id) return;
    setLoading(true);
    
    // Parallel fetch for raw data
    const [
      { data: invoices },
      { data: expenses },
      { data: salesData }
    ] = await Promise.all([
      supabase.from('invoices').select('total, issue_date').eq('business_id', business.id).not('status', 'eq', 'VOID'),
      supabase.from('expenses').select('amount, expense_date, category').eq('business_id', business.id),
      supabase.from('line_items').select('quantity, line_total, catalogue_items(name), invoices!inner(business_id, status)').eq('invoices.business_id', business.id).not('invoices.status', 'eq', 'VOID').not('catalogue_item_id', 'is', null)
    ]);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    
    const monthlyData = months.map(month => ({
      month,
      revenue: 0,
      expenses: 0
    }));

    let totalRev = 0;
    let totalExp = 0;

    invoices?.forEach(inv => {
      const date = new Date(inv.issue_date);
      if (date.getFullYear() === currentYear) {
        monthlyData[date.getMonth()].revenue += Number(inv.total);
        totalRev += Number(inv.total);
      }
    });

    expenses?.forEach(exp => {
      const date = new Date(exp.expense_date);
      if (date.getFullYear() === currentYear) {
        monthlyData[date.getMonth()].expenses += Number(exp.amount);
        totalExp += Number(exp.amount);
      }
    });

    // Expenses category split
    const categoryTotals: Record<string, number> = {};
    expenses?.forEach(exp => {
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + Number(exp.amount);
    });

    const categorySplit = Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Top Selling Items (by revenue)
    const itemSales: Record<string, number> = {};
    salesData?.forEach((li: any) => {
      const itemName = li.catalogue_items?.name || 'Unknown Item';
      itemSales[itemName] = (itemSales[itemName] || 0) + Number(li.line_total);
    });

    const topSellingItems = Object.entries(itemSales)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    setAnalyticsData(monthlyData);
    setMetrics({
      totalRevenue: totalRev,
      totalExpenses: totalExp,
      netProfit: totalRev - totalExp,
      margin: totalRev > 0 ? ((totalRev - totalExp) / totalRev) * 100 : 0,
      categorySplit,
      topSellingItems
    });
    setLoading(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [business?.id]);

  const fmt = (v: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(v);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 animate-in fade-in duration-700">
        <div className="relative size-16">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-primary rounded-full animate-spin"></div>
        </div>
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">Analyzing Financial Patterns...</p>
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Intelligence</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Financial Analysis & Real-time Bi</p>
        </div>
        <div className="flex items-center gap-2">
           <div className="px-3 py-1.5 rounded-full bg-surface border border-border-subtle flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono text-slate-300 font-bold uppercase tracking-widest">Live Syncing</span>
           </div>
        </div>
      </header>

      {/* KPI Stream */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Revenue (YTD)', value: metrics.totalRevenue, color: 'text-white' },
          { label: 'Burn Rate', value: metrics.totalExpenses, color: 'text-slate-400' },
          { label: 'Net Surplus', value: metrics.netProfit, color: 'text-emerald-400' },
          { label: 'Net Margin', value: `${metrics.margin.toFixed(1)}%`, color: 'text-primary' }
        ].map(kpi => (
          <div key={kpi.label} className="bg-surface border border-border-subtle p-5 rounded-2xl relative overflow-hidden">
             <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">{kpi.label}</p>
             <h3 className={`font-mono text-lg font-bold tracking-tight ${kpi.color}`}>
                {typeof kpi.value === 'number' ? fmt(kpi.value) : kpi.value}
             </h3>
             <div className="absolute right-[-10px] bottom-[-10px] opacity-10 blur-xl size-12 bg-white rounded-full" />
          </div>
        ))}
      </div>

      {/* Primary Chart Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-surface border border-border-subtle p-6 rounded-3xl group">
           <div className="flex items-center justify-between mb-8">
              <div>
                 <h2 className="font-display text-xl font-bold text-slate-100 tracking-tight">Performance Delta</h2>
                 <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Income vs Overheads (ZAR)</p>
              </div>
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary" />
                    <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">Revenue</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-status-expenses" />
                    <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">Expenses</span>
                 </div>
              </div>
           </div>
           
           <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#475569" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ dy: 10 }}
                  />
                  <YAxis 
                    stroke="#475569" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(v) => `R${v/1000}k`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                    itemStyle={{ fontSize: '10px', textTransform: 'uppercase' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                  <Area type="monotone" dataKey="expenses" stroke="#f43f5e" fillOpacity={1} fill="url(#colorExp)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Secondary Analytics - Expenses */}
        <div className="bg-surface border border-border-subtle p-6 rounded-3xl flex flex-col">
           <h2 className="font-display text-xl font-bold text-slate-100 tracking-tight mb-2">Expense Mix</h2>
           <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-8">Top Overhead Channels</p>
           <div className="flex-1 min-h-[200px] relative">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                      data={metrics.categorySplit.length > 0 ? metrics.categorySplit : [{ name: 'No Data', value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {metrics.categorySplit.length > 0 ? 
                        metrics.categorySplit.map((_, index) => (
                           <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        )) : 
                        <Cell fill="#1e293b" />
                      }
                    </Pie>
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                    />
                 </PieChart>
              </ResponsiveContainer>
           </div>
           <div className="mt-4 space-y-2">
              {metrics.categorySplit.slice(0, 3).map((cat, i) => (
                <div key={cat.name} className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest truncate max-w-[80px]">{cat.name.replace('_', ' ')}</span>
                   </div>
                   <span className="text-[9px] font-mono text-white font-bold">{fmt(cat.value)}</span>
                </div>
              ))}
           </div>
        </div>

        {/* Secondary Analytics - Sales */}
        <div className="bg-surface border border-border-subtle p-6 rounded-3xl flex flex-col">
           <h2 className="font-display text-xl font-bold text-slate-100 tracking-tight mb-2">Top Selling</h2>
           <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-8">Product Revenue Split</p>
           <div className="flex-1 min-h-[200px] relative">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                      data={metrics.topSellingItems.length > 0 ? metrics.topSellingItems : [{ name: 'No Data', value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {metrics.topSellingItems.length > 0 ? 
                        metrics.topSellingItems.map((_, index) => (
                           <Cell key={`cell-sales-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                        )) : 
                        <Cell fill="#1e293b" />
                      }
                    </Pie>
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                    />
                 </PieChart>
              </ResponsiveContainer>
           </div>
           <div className="mt-4 space-y-2">
              {metrics.topSellingItems.slice(0, 3).map((item, i) => (
                <div key={item.name} className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: COLORS[(i + 2) % COLORS.length] }} />
                      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest truncate max-w-[80px]">{item.name}</span>
                   </div>
                   <span className="text-[9px] font-mono text-white font-bold">{fmt(item.value)}</span>
                </div>
              ))}
              {metrics.topSellingItems.length === 0 && (
                <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest text-center py-4">No sales data available</p>
              )}
           </div>
        </div>
      </div>

      {/* Actionable Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { title: 'Tax Strategy', desc: 'Claimable VAT currently at R12,450. Ensure all receipts are vaulted by month-end.', icon: 'description', color: 'text-orange-400' },
          { title: 'Cash Flow Forecast', desc: 'Predicted inflow of R85k based on outstanding invoices due next week.', icon: 'moving', color: 'text-emerald-400' }
        ].map(report => (
          <div key={report.title} className="bg-surface/50 border border-border-subtle p-6 rounded-2xl relative overflow-hidden group hover:bg-surface-muted transition-all cursor-pointer">
             <div className="flex items-start justify-between mb-4">
                <div className={`size-10 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center ${report.color}`}>
                  <span className="material-symbols-outlined text-[20px]">{report.icon}</span>
                </div>
                <span className="material-symbols-outlined text-slate-700 text-[18px]">arrow_forward</span>
             </div>
             <h3 className="font-display text-lg font-bold text-slate-100 tracking-tight mb-2">{report.title}</h3>
             <p className="text-slate-500 text-sm leading-relaxed">{report.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
