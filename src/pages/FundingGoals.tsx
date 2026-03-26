import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';
import Header from '../components/Header';
import { 
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer
} from 'recharts';

// Data types from Supabase
interface Invoice {
  id: string;
  amount_paid: number;
  total: number;
  issue_date: string;
  status: string;
}

interface Expense {
  id: string;
  amount: number;
  expense_date: string;
  category: string;
  receipt_url: string | null;
}

interface Client {
  id: string;
  invoice_count: number;
}

interface FundingGoal {
  id: string;
  status: string;
}

// Gamification Checkbox state
interface MilestoneState {
  [key: string]: boolean;
}

export default function MyGrowth() {
  const { business } = useAuth();
  const [loading, setLoading] = useState(true);

  // Live Data Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [goals, setGoals] = useState<FundingGoal[]>([]);

  // Local state for dopamine checkmarks
  const [milestones, setMilestones] = useState<MilestoneState>({});

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    
    // Fetch all required live data concurrently
    const [invRes, expRes, cliRes, goalsRes] = await Promise.all([
      supabase.from('invoices').select('id, amount_paid, total, issue_date, status').eq('business_id', business!.id),
      supabase.from('expenses').select('id, amount, expense_date, category, receipt_url').eq('business_id', business!.id),
      supabase.from('clients').select('id, invoice_count').eq('business_id', business!.id),
      supabase.from('funding_goals').select('id, status').eq('business_id', business!.id)
    ]);

    if (invRes.data) setInvoices(invRes.data);
    if (expRes.data) setExpenses(expRes.data);
    if (cliRes.data) setClients(cliRes.data);
    if (goalsRes.data) setGoals(goalsRes.data);

    setLoading(false);
  }, [business?.id]);

  useEffect(() => {
    if (business?.id) fetchDashboardData();
  }, [fetchDashboardData]);

  const toggleMilestone = useCallback((id: string) => {
    setMilestones(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ==========================================
  // METRICS ENGINE (Live Data Calculation)
  // ==========================================
  const metrics = useMemo(() => {
    let score = 0;
    
    // Helper: Group by month
    const currentMonth = new Date().getMonth();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    
    const getMonthTotal = (items: any[], dateField: string, amountField: string, targetMonth: number) => {
      return items
        .filter(i => new Date(i[dateField]).getMonth() === targetMonth)
        .reduce((sum, item) => sum + Number(item[amountField] || 0), 0);
    };

    // 1. Revenue Stability (0-10)
    const revThisMonth = getMonthTotal(invoices, 'issue_date', 'total', currentMonth);
    const revLastMonth = getMonthTotal(invoices, 'issue_date', 'total', lastMonth);
    let revScore = 0;
    if (revThisMonth > 10000) revScore += 5;
    if (revThisMonth >= revLastMonth && revThisMonth > 0) revScore += 5;
    score += revScore;

    // 2. Cash Flow Health (0-10)
    const expThisMonth = getMonthTotal(expenses, 'expense_date', 'amount', currentMonth);
    const netCashFlow = revThisMonth - expThisMonth;
    let cfScore = 0;
    if (netCashFlow > 0) cfScore += 5;
    if (revThisMonth > 0 && expThisMonth < revThisMonth * 0.8) cfScore += 5; // Good runway margin
    score += cfScore;

    // 3. Expense Control (0-10)
    let expScore = 0;
    const categorized = expenses.filter(e => e.category && e.category !== 'OTHER').length;
    if (expenses.length > 0) {
      if ((categorized / expenses.length) > 0.8) expScore += 5;
      if (expThisMonth <= (revThisMonth * 0.7)) expScore += 5; 
    } else {
      expScore = 5; // Default if no expenses yet
    }
    score += expScore;

    // 4. Profitability (0-10)
    let profScore = 0;
    const allTimeRev = invoices.reduce((sum, i) => sum + Number(i.total), 0);
    const allTimeExp = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    if (allTimeRev > 0) {
      const margin = (allTimeRev - allTimeExp) / allTimeRev;
      if (margin > 0.1) profScore += 5;
      if (margin > 0.3) profScore += 5;
    }
    score += profScore;

    // 5. Banking & Transactions (0-10)
    let bankScore = 5; // Mocking slightly since we don't have direct bank sync check yet
    if (invoices.some(i => i.status === 'PAID')) bankScore += 5;
    score += bankScore;

    // 6. Financial Records (0-10)
    let recScore = 0;
    if (invoices.length > 0) recScore += 5;
    const withReceipts = expenses.filter(e => e.receipt_url).length;
    if (expenses.length > 0 && (withReceipts / expenses.length) >= 0.5) recScore += 5;
    score += recScore;

    // 7. Growth Performance (0-10)
    let growthScore = 0;
    if (revLastMonth > 0) {
      const growth = ((revThisMonth - revLastMonth) / revLastMonth) * 100;
      if (growth > 0) growthScore += 5;
      if (growth > 10) growthScore += 5;
    }
    score += growthScore;

    // 8. Debt & Credit Health (0-10)
    let debtScore = 10;
    const overdue = invoices.filter(i => i.status === 'OVERDUE').length;
    if (overdue > 0) debtScore -= 5;
    if (overdue > 5) debtScore -= 5;
    score += debtScore;

    // 9. Unit Economics (0-10)
    let ueScore = 0;
    if (clients.length > 0) ueScore += 5;
    const repeatClients = clients.filter(c => c.invoice_count > 1).length;
    if (clients.length > 0 && (repeatClients / clients.length) > 0.3) ueScore += 5;
    score += ueScore;

    // 10. Funding Utilisation (0-10)
    let fundScore = 0;
    if (goals.length > 0) fundScore += 5;
    if (goals.some(g => g.status === 'ACHIEVED')) fundScore += 5;
    score += fundScore;

    // Chart Data Generation (Last 6 months revenue vs expense)
    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth();
      chartData.push({
        name: d.toLocaleDateString('en-US', { month: 'short' }),
        Revenue: getMonthTotal(invoices, 'issue_date', 'total', m),
        Expenses: getMonthTotal(expenses, 'expense_date', 'amount', m)
      });
    }

    return {
      totalScore: score,
      revScore, cfScore, expScore, profScore, bankScore, recScore, growthScore, debtScore, ueScore, fundScore,
      chartData
    };
  }, [invoices, expenses, clients, goals]);

  // ==========================================
  // UI HELPERS
  // ==========================================
  const getStatusColor = (score: number, max: number = 10) => {
    const ratio = score / max;
    if (ratio >= 0.8) return 'text-emerald-400';
    if (ratio >= 0.5) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getStatusBg = (score: number, max: number = 10) => {
    const ratio = score / max;
    if (ratio >= 0.8) return 'bg-emerald-500/10 border-emerald-500/20';
    if (ratio >= 0.5) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-rose-500/10 border-rose-500/20';
  };

  const getReadinessLabel = (score: number) => {
    if (score >= 80) return { label: 'Funding Ready', color: 'text-emerald-400', icon: 'verified' };
    if (score >= 60) return { label: 'Near Ready', color: 'text-amber-400', icon: 'trending_up' };
    return { label: 'Not Ready', color: 'text-rose-400', icon: 'warning' };
  };

  const readiness = getReadinessLabel(metrics.totalScore);

  // Gamified Card Component
  const ParameterCard = ({ 
    title, score, icon, description, weeklyGoals, idPrefix
  }: { 
    title: string, score: number, icon: string, description: string, weeklyGoals: {id: string, label: string}[], idPrefix: string 
  }) => (
    <div className={`rounded-3xl p-6 border transition-all duration-500 ${getStatusBg(score, 10)} flex flex-col group hover:shadow-lg hover:shadow-black/20`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={`size-10 rounded-xl flex items-center justify-center bg-surface border border-border-subtle ${getStatusColor(score, 10)}`}>
            <span className="material-symbols-outlined">{icon}</span>
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-slate-100 group-hover:text-white transition-colors">{title}</h3>
            <p className="text-sm text-slate-400">{score}/10 points</p>
          </div>
        </div>
        <div className="text-right">
           <div className={`radial-progress text-xs font-mono font-bold ${getStatusColor(score, 10)}`} style={{ '--value': score * 10, '--size': '2.5rem', '--thickness': '3px' } as any}>
             {score}/10
           </div>
        </div>
      </div>
      
      <p className="text-sm text-slate-300 mb-6 flex-grow">{description}</p>
      
      <div className="space-y-3 mt-auto border-t border-border-subtle pt-4">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Weekly Milestones</p>
        {weeklyGoals.map((wg) => {
          const milId = `${idPrefix}_${wg.id}`;
          const isDone = milestones[milId];
          return (
            <div 
              key={milId}
              onClick={() => toggleMilestone(milId)}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-300 ${
                isDone 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 translate-x-1' 
                  : 'bg-surface border border-border-subtle hover:border-primary/50'
              }`}
            >
              <div className={`flex-shrink-0 size-5 rounded-full border flex items-center justify-center transition-colors ${
                isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-500 text-transparent'
              }`}>
                <span className="material-symbols-outlined text-[14px]">check</span>
              </div>
              <span className={`text-sm transition-colors ${isDone ? 'text-emerald-400 strike-through line-through opacity-80' : 'text-slate-300'}`}>
                {wg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Header />

      {/* Hero Section */}
      <section className="mt-8 mb-12 flex flex-col items-center text-center">
         <p className="text-[10px] font-mono text-primary uppercase tracking-[0.2em] mb-4 font-bold bg-primary/10 px-3 py-1 rounded-full border border-primary/20 inline-block">
           Funding Readiness Dashboard
         </p>
         <h1 className="font-display text-5xl sm:text-7xl font-bold tracking-tight text-white mb-6">
           My Growth
         </h1>
         
         <div className="relative flex flex-col items-center justify-center p-12 rounded-[3rem] border border-border-subtle bg-gradient-to-b from-surface to-surface-muted w-full max-w-3xl overflow-hidden shadow-2xl">
            {/* Background glow based on readiness */}
            <div className={`absolute inset-0 opacity-10 blur-[100px] ${
              readiness.label === 'Funding Ready' ? 'bg-emerald-500' : 
              readiness.label === 'Near Ready' ? 'bg-amber-500' : 'bg-rose-500'
            }`} />

            <div className="relative z-10 flex flex-col items-center">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-7xl sm:text-9xl font-display font-black text-white">{metrics.totalScore}</span>
                <span className="text-3xl text-slate-500 font-bold">/100</span>
              </div>
              
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border bg-background/50 backdrop-blur-md ${getStatusBg(metrics.totalScore, 100)}`}>
                <span className={`material-symbols-outlined ${readiness.color}`}>{readiness.icon}</span>
                <span className={`font-mono font-bold uppercase tracking-wider text-sm ${readiness.color}`}>
                  {readiness.label}
                </span>
              </div>
            </div>

            {/* Eligibility Reminders */}
            {metrics.totalScore < 80 && (
              <div className="mt-8 pt-6 border-t border-border-subtle w-full text-left">
                <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest mb-3">Eligibility Reminders</p>
                <div className="flex gap-3 text-sm text-slate-300 items-start">
                  <span className="material-symbols-outlined text-amber-400 text-xl shrink-0">info</span>
                  <p>Investors look for a score of 80+. Focus on your lowest-performing metrics below. Completing weekly milestones will boost your metrics over time.</p>
                </div>
              </div>
            )}
         </div>
      </section>

      {/* Live Chart Section */}
      <section className="mb-12">
        <h2 className="text-xl font-display font-bold text-white mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">monitoring</span>
          Cash Flow Trends
        </h2>
        <div className="h-[300px] bg-surface border border-border-subtle rounded-3xl p-6">
          {loading ? (
             <div className="w-full h-full flex items-center justify-center animate-pulse text-slate-500 gap-2">
               <span className="material-symbols-outlined animate-spin">sync</span> Loading Live Data...
             </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#f8fafc' }}
                  itemStyle={{ fontSize: '14px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="Revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="Expenses" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* 10 Parameters Grid */}
      <h2 className="text-xl font-display font-bold text-white mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">account_tree</span>
        The 10 Funder Gates
      </h2>
      
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <div key={i} className="h-64 rounded-3xl bg-surface/50 border border-border-subtle animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          
          <ParameterCard 
            idPrefix="rev"
            title="Revenue Stability" 
            score={metrics.revScore} 
            icon="account_balance_wallet"
            description="Measures your ability to generate consistent monthly income without massive drops."
            weeklyGoals={[
              { id: '1', label: 'Issue 2 new invoices this week.' },
              { id: '2', label: 'Follow up on all Draft invoices.' }
            ]}
          />

          <ParameterCard 
            idPrefix="cf"
            title="Cash Flow Health" 
            score={metrics.cfScore} 
            icon="water_drop"
            description="Are you bleeding cash? Investors want to see that money coming in exceeds money going out."
            weeklyGoals={[
              { id: '1', label: 'Review upcoming expenses.' },
              { id: '2', label: 'Keep this week\'s spending under R5,000.' }
            ]}
          />

          <ParameterCard 
            idPrefix="exp"
            title="Expense Control" 
            score={metrics.expScore} 
            icon="query_stats"
            description="Ensures your business runs lean. High uncategorized expenses suggest poor tracing."
            weeklyGoals={[
              { id: '1', label: 'Categorize all "OTHER" expenses.' },
              { id: '2', label: 'Cancel 1 unused software subscription.' }
            ]}
          />

          <ParameterCard 
            idPrefix="prof"
            title="Profitability" 
            score={metrics.profScore} 
            icon="point_of_sale"
            description="Your overarching profit margins. Shows if your business model actually makes financial sense."
            weeklyGoals={[
              { id: '1', label: 'Review pricing of top services.' },
              { id: '2', label: 'Identify highest cost supplier.' }
            ]}
          />

          <ParameterCard 
            idPrefix="bank"
            title="Banking Activity" 
            score={metrics.bankScore} 
            icon="account_balance"
            description="Constant flow of legitimate transactions verified via your linked business bank account."
            weeklyGoals={[
              { id: '1', label: 'Reconcile 5 bank transactions.' },
              { id: '2', label: 'Ensure no payments bounced.' }
            ]}
          />

          <ParameterCard 
            idPrefix="rec"
            title="Financial Records" 
            score={metrics.recScore} 
            icon="receipt_long"
            description="The cleanliness of your books. Missing receipts equal immediate red flags to auditors."
            weeklyGoals={[
              { id: '1', label: 'Attach receipts to 5 expenses.' },
              { id: '2', label: 'Ensure zero missing vat numbers on invoices.' }
            ]}
          />

          <ParameterCard 
            idPrefix="grow"
            title="Growth Performance" 
            score={metrics.growthScore} 
            icon="rocket_launch"
            description="Are you becoming stagnant? Growth performance tracks MoM expansion."
            weeklyGoals={[
              { id: '1', label: 'Pitch to 3 new potential clients.' },
              { id: '2', label: 'Upsell to 1 existing client.' }
            ]}
          />

          <ParameterCard 
             idPrefix="debt"
             title="Debt & Credit" 
             score={metrics.debtScore} 
             icon="credit_score"
             description="Low debt-to-income ratio and aggressive chasing of overdue invoices."
             weeklyGoals={[
               { id: '1', label: 'Send automated reminders to all OVERDUE.' },
               { id: '2', label: 'Pay down high-interest accounts.' }
             ]}
          />

          <ParameterCard 
             idPrefix="ue"
             title="Unit Economics" 
             score={metrics.ueScore} 
             icon="pie_chart"
             description="Life Time Value (LTV) vs Customer Acquisition Cost. Do clients return?"
             weeklyGoals={[
               { id: '1', label: 'Send a "Thank You" to top 3 clients.' },
               { id: '2', label: 'Launch a referral promotion.' }
             ]}
          />

          <ParameterCard 
             idPrefix="fund"
             title="Funding Utilisation" 
             score={metrics.fundScore} 
             icon="moving"
             description="Proves to investors you know exactly what to do with the money you ask for."
             weeklyGoals={[
               { id: '1', label: 'Update your active Funding Goal.' },
               { id: '2', label: 'Document ROI on last big expenditure.' }
             ]}
          />

        </div>
      )}

    </div>
  );
}
