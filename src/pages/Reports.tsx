import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, BarChart, Bar
} from 'recharts';
import { useAuth } from '../components/AuthProvider';

// Import Accounting Engine
import { 
  generateIncomeStatement, getVATSummary, buildCashFlowStatement, 
  getDebtorsAging, getInvoiceSummary, getExpenseReport, generateExecutiveSummary 
} from '../accounting';
import type { 
  IncomeStatement, VATResult, CashFlowResult, DebtorsAgingResult, Period,
  InvoiceSummaryResult, ExpenseReportResult, ExecutiveSummaryResult
} from '../accounting/types';

// Import Export Functions
import { 
  exportIncomeStatementPDF, exportVATReportPDF, exportCashFlowPDF, exportDebtorsAgingPDF,
  exportInvoiceSummaryPDF, exportExpenseReportPDF, exportExecutiveSummaryPDF
} from '../reports/pdf';
import { 
  exportIncomeStatementXLSX, exportVATReportXLSX, exportCashFlowXLSX, exportDebtorsAgingXLSX,
  exportInvoiceSummaryXLSX, exportExpenseReportXLSX, exportExecutiveSummaryXLSX
} from '../reports/excel';

const COLORS = ['#0ea5e9', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#64748b', '#2dd4bf'];

type TabType = 'pnl' | 'cash' | 'vat' | 'debtors' | 'expenses' | 'invoices' | 'exec';

export default function Reports() {
  const { business } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('exec'); // Default to Executive Summary for premium feel
  
  // State for periods
  const [period, setPeriod] = useState<Period>({
    dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0]
  });

  // Accounting Results
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [vatSummary, setVatSummary] = useState<VATResult | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowResult | null>(null);
  const [debtors, setDebtors] = useState<DebtorsAgingResult | null>(null);
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummaryResult | null>(null);
  const [expenseReport, setExpenseReport] = useState<ExpenseReportResult | null>(null);
  const [executiveSummary, setExecutiveSummary] = useState<ExecutiveSummaryResult | null>(null);

  const fetchAccountingData = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    
    try {
      const [is, vat, cf, debt, inv, exp, exec] = await Promise.all([
        generateIncomeStatement(business.id, period),
        getVATSummary(business.id, period),
        buildCashFlowStatement(business.id, period, 0),
        getDebtorsAging(business.id, period.dateTo),
        getInvoiceSummary(business.id, period),
        getExpenseReport(business.id, period),
        generateExecutiveSummary(business.id, period, business.name || 'Your Business', 0)
      ]);

      setIncomeStatement(is);
      setVatSummary(vat);
      setCashFlow(cf);
      setDebtors(debt);
      setInvoiceSummary(inv);
      setExpenseReport(exp);
      setExecutiveSummary(exec);
    } catch (error) {
      console.error('Accounting Engine Error:', error);
    } finally {
      setLoading(false);
    }
  }, [business?.id, business?.name, period]);

  useEffect(() => {
    fetchAccountingData();
  }, [fetchAccountingData]);

  const fmt = useMemo(() => (v: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(v), []);

  const handleExport = (type: 'pdf' | 'excel') => {
    if (!business) return;
    const bName = business.name || 'Your Business';

    switch (activeTab) {
      case 'pnl':
        if (incomeStatement) type === 'pdf' ? exportIncomeStatementPDF(incomeStatement, bName) : exportIncomeStatementXLSX(incomeStatement, bName);
        break;
      case 'vat':
        if (vatSummary) type === 'pdf' ? exportVATReportPDF(vatSummary, bName) : exportVATReportXLSX(vatSummary, bName);
        break;
      case 'cash':
        if (cashFlow) type === 'pdf' ? exportCashFlowPDF(cashFlow, bName) : exportCashFlowXLSX(cashFlow, bName);
        break;
      case 'debtors':
        if (debtors) type === 'pdf' ? exportDebtorsAgingPDF(debtors, bName) : exportDebtorsAgingXLSX(debtors, bName);
        break;
      case 'invoices':
        if (invoiceSummary) type === 'pdf' ? exportInvoiceSummaryPDF(invoiceSummary, bName) : exportInvoiceSummaryXLSX(invoiceSummary, bName);
        break;
      case 'expenses':
        if (expenseReport) type === 'pdf' ? exportExpenseReportPDF(expenseReport, bName) : exportExpenseReportXLSX(expenseReport, bName);
        break;
      case 'exec':
        if (executiveSummary) type === 'pdf' ? exportExecutiveSummaryPDF(executiveSummary) : exportExecutiveSummaryXLSX(executiveSummary);
        break;
    }
  };

  const setPeriodPreset = (preset: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear') => {
    const now = new Date();
    let from = new Date();
    let to = new Date();

    switch (preset) {
      case 'thisMonth':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = now;
        break;
      case 'lastMonth':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(now.getMonth() / 3);
        from = new Date(now.getFullYear(), quarter * 3, 1);
        to = now;
        break;
      case 'thisYear':
        from = new Date(now.getFullYear(), 0, 1);
        to = now;
        break;
    }

    setPeriod({
      dateFrom: from.toISOString().split('T')[0],
      dateTo: to.toISOString().split('T')[0]
    });
  };

  if (loading && !executiveSummary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 animate-in fade-in duration-700">
        <div className="relative size-16">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-primary rounded-full animate-spin"></div>
        </div>
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">Running Accounting Engine v3...</p>
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between mb-8 gap-6">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Intelligence</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Deterministic Financial Reporting Suite</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Period Presets */}
          <div className="flex items-center gap-1 bg-surface/30 p-1 rounded-xl border border-border-subtle">
            {[
              { id: 'thisMonth', label: 'MTD' },
              { id: 'lastMonth', label: 'Last Month' },
              { id: 'thisQuarter', label: 'QTD' },
              { id: 'thisYear', label: 'YTD' }
            ].map(preset => (
              <button
                key={preset.id}
                onClick={() => setPeriodPreset(preset.id as any)}
                className="px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase text-slate-500 hover:text-slate-200 hover:bg-surface transition-all"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Period Picker */}
          <div className="flex items-center gap-2 bg-surface/50 p-2 rounded-2xl border border-border-subtle">
            <div className="flex items-center gap-2 px-2">
               <span className="text-[10px] font-mono text-slate-500 uppercase">From</span>
               <input 
                 type="date" 
                 value={period.dateFrom}
                 onChange={(e) => setPeriod(prev => ({ ...prev, dateFrom: e.target.value }))}
                 className="bg-transparent text-xs font-mono text-slate-300 border-none focus:ring-0 p-0"
               />
            </div>
            <div className="w-px h-4 bg-slate-800" />
            <div className="flex items-center gap-2 px-2">
               <span className="text-[10px] font-mono text-slate-500 uppercase">To</span>
               <input 
                 type="date" 
                 value={period.dateTo}
                 onChange={(e) => setPeriod(prev => ({ ...prev, dateTo: e.target.value }))}
                 className="bg-transparent text-xs font-mono text-slate-300 border-none focus:ring-0 p-0"
               />
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-4 scrollbar-none">
        {[
          { id: 'exec', label: 'Executive Summary', icon: 'dashboard' },
          { id: 'pnl', label: 'Income Statement', icon: 'payments' },
          { id: 'cash', label: 'Cash Flow', icon: 'account_balance_wallet' },
          { id: 'vat', label: 'VAT Report', icon: 'description' },
          { id: 'debtors', label: 'Aged Debtors', icon: 'group' },
          { id: 'expenses', label: 'Expense Report', icon: 'receipt_long' },
          { id: 'invoices', label: 'Invoice Summary', icon: 'fact_check' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-primary/10 border-primary text-primary font-bold shadow-lg shadow-primary/5' 
                : 'bg-surface border-border-subtle text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            <span className="text-xs uppercase tracking-wider font-mono">{tab.label}</span>
          </button>
        ))}
        
        <div className="flex-1 min-w-[20px]" />
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleExport('excel')}
            className="px-3 py-2 rounded-xl bg-surface border border-border-subtle text-slate-300 hover:text-white transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">table_view</span>
            <span className="text-[10px] font-mono uppercase font-bold">XLSX</span>
          </button>
          <button 
            onClick={() => handleExport('pdf')}
            className="px-3 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            <span className="text-[10px] font-mono uppercase font-bold">PDF</span>
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* EXECUTIVE SUMMARY TAB */}
        {activeTab === 'exec' && executiveSummary && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPI card={{ label: 'Total Revenue', value: fmt(executiveSummary.revenue.total_excl_vat), color: 'text-white', desc: 'Total sales value before tax.' }} />
              <KPI card={{ label: 'Net Profit', value: fmt(executiveSummary.net_profit), color: executiveSummary.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400', desc: "What's left over after paying all expenses." }} />
              <KPI card={{ label: 'Bank Position', value: fmt(executiveSummary.cash_flow.closing_balance), color: executiveSummary.cash_flow.closing_balance >= 0 ? 'text-primary' : 'text-rose-400', desc: 'Actual cash in your bank account.' }} />
              <KPI card={{ label: 'VAT Liability', value: fmt(executiveSummary.vat.vat_payable), color: executiveSummary.vat.vat_payable >= 0 ? 'text-amber-400' : 'text-emerald-400', desc: 'Amount owed to SARS (or refund if negative).' }} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-surface border border-border-subtle p-8 rounded-3xl">
                <h2 className="font-display text-xl font-bold text-slate-100 mb-6">Performance Snapshot</h2>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Revenue', val: executiveSummary.revenue.total_excl_vat, fill: '#0ea5e9' },
                      { name: 'Expenses', val: executiveSummary.expenses.total_excl_vat, fill: '#f43f5e' },
                      { name: 'Profit', val: executiveSummary.net_profit, fill: '#10b981' }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(v) => `R${v/1000}k`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                        itemStyle={{ color: '#f1f5f9', fontFamily: 'monospace', fontSize: '12px' }}
                      />
                      <Bar dataKey="val" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-surface border border-border-subtle p-8 rounded-3xl">
                <h2 className="font-display text-xl font-bold text-slate-100 mb-6">Top Expenses</h2>
                <div className="space-y-6">
                  {executiveSummary.top_expense_categories.map(([cat, amount]) => (
                    <div key={cat} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{cat.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-mono font-bold text-slate-200">{fmt(amount)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary opacity-80" 
                          style={{ width: `${(amount / executiveSummary.expenses.total_excl_vat) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {executiveSummary.top_expense_categories.length === 0 && (
                    <p className="text-center py-12 text-slate-600 font-mono text-[10px] uppercase">No expense data</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* INCOME STATEMENT TAB */}
        {activeTab === 'pnl' && incomeStatement && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPI card={{ label: 'Revenue (Net)', value: fmt(incomeStatement.revenue.total_excl_vat), color: 'text-white', desc: 'Money earned from sales.' }} />
              <KPI card={{ label: 'Expenses (Net)', value: fmt(incomeStatement.expenses.total_excl_vat), color: 'text-slate-400', desc: 'Money spent to run the business.' }} />
              <KPI card={{ label: 'Net Profit', value: fmt(incomeStatement.net_profit), color: incomeStatement.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400', desc: 'Your actual earnings after costs.' }} />
              <KPI card={{ label: 'Margin', value: `${incomeStatement.margin_pct.toFixed(1)}%`, color: 'text-primary', desc: 'Percentage of revenue kept as profit.' }} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-surface border border-border-subtle p-6 rounded-3xl">
                <h2 className="font-display text-xl font-bold text-slate-100 mb-6">Profit & Loss Breakdown</h2>
                <div className="space-y-4">
                   <Row label="Total Revenue (Excl VAT)" value={fmt(incomeStatement.revenue.total_excl_vat)} />
                   <Row label="Output VAT Collected" value={fmt(incomeStatement.revenue.total_vat)} muted />
                   <div className="h-px bg-slate-800 my-4" />
                   <Row label="Total Operating Expenses" value={`(${fmt(incomeStatement.expenses.total_excl_vat)})`} />
                   {Object.entries(incomeStatement.expenses.by_category).map(([cat, val]) => (
                     <Row key={cat} label={cat.replace(/_/g, ' ')} value={fmt(val)} sub />
                   ))}
                   <div className="h-px bg-slate-800 my-4" />
                   <Row label="Net Profit" value={fmt(incomeStatement.net_profit)} bold highlight={incomeStatement.net_profit >= 0} />
                </div>
              </div>

              <div className="bg-surface border border-border-subtle p-6 rounded-3xl">
                 <h2 className="font-display text-xl font-bold text-slate-100 mb-2">Expense Mix</h2>
                 <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-8">Net expense distribution</p>
                 <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                          <Pie
                            data={Object.entries(incomeStatement.expenses.by_category).map(([name, value]) => ({ name, value }))}
                            cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value"
                          >
                            {Object.keys(incomeStatement.expenses.by_category).map((_, index) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} />
                       </PieChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="mt-4 space-y-2">
                    {Object.entries(incomeStatement.expenses.by_category).slice(0, 4).map(([name, value], i) => (
                      <div key={name} className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-[9px] font-mono text-slate-400 uppercase">{name.replace(/_/g, ' ')}</span>
                         </div>
                         <span className="text-[9px] font-mono text-white font-bold">{fmt(value)}</span>
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          </>
        )}

        {/* CASH FLOW TAB */}
        {activeTab === 'cash' && cashFlow && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface border border-border-subtle p-8 rounded-3xl">
               <h2 className="font-display text-2xl font-bold text-slate-100 mb-6">Cash Flow Statement</h2>
               <div className="space-y-6">
                  <Row label="Opening Cash Balance" value={fmt(cashFlow.opening_balance)} muted desc="Money you had in the bank at the start of the period." />
                  <div className="h-px bg-slate-800" />
                  <Row label="Cash Received (Client Payments)" value={fmt(cashFlow.cash_in)} highlight desc="Actual cash that landed in your bank account." />
                  <Row label="Cash Paid Out (Supplier/Expenses)" value={`(${fmt(cashFlow.cash_out)})`} desc="Actual cash that left your bank account." />
                  <div className="h-px bg-slate-800" />
                  <Row label="Net Cash Movement" value={fmt(cashFlow.net_movement)} bold highlight={cashFlow.net_movement >= 0} desc="Difference between cash in and cash out." />
                  <Row label="Closing Cash Balance" value={fmt(cashFlow.closing_balance)} bold desc="Money you have in the bank at the end of the period." />
               </div>
            </div>
            
            <div className="bg-surface border border-border-subtle p-8 rounded-3xl flex flex-col items-center justify-center text-center">
               <h3 className="font-display text-xl font-bold text-slate-100 mb-6">Cash Movement Summary</h3>
               <p className="text-[10px] font-mono text-slate-500 mb-4 max-w-xs">A visual representation of money entering versus leaving your business.</p>
               <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Cash In', val: cashFlow.cash_in, fill: '#10b981' },
                      { name: 'Cash Out', val: cashFlow.cash_out, fill: '#f43f5e' },
                      { name: 'Net', val: Math.abs(cashFlow.net_movement), fill: cashFlow.net_movement >= 0 ? '#0ea5e9' : '#f59e0b' }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(v) => `R${v/1000}k`} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} itemStyle={{ color: '#f1f5f9', fontFamily: 'monospace', fontSize: '12px' }} />
                      <Bar dataKey="val" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
          </div>
        )}

        {/* VAT REPORT TAB */}
        {activeTab === 'vat' && vatSummary && (
          <div className="max-w-2xl mx-auto bg-surface border border-border-subtle p-8 rounded-3xl">
             <div className="flex items-center justify-between mb-8">
               <h2 className="font-display text-2xl font-bold text-slate-100">SARS VAT201 Report</h2>
               <div className="px-3 py-1 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 text-[10px] font-mono font-bold uppercase">Compliance Ready</div>
             </div>
             
             <div className="space-y-6">
                <Row label="Output VAT (Sales Invoices)" value={fmt(vatSummary.output_vat)} desc="VAT you charged to your customers on sales. You owe this to SARS." />
                <Row label="Input VAT (Claimable Expenses)" value={`(${fmt(vatSummary.input_vat)})`} desc="VAT you paid on business expenses. You claim this back from SARS." />
                <div className="h-px bg-slate-800" />
                <div className="p-6 rounded-2xl bg-surface-muted border border-border-subtle flex items-center justify-between mt-6">
                   <div>
                      <p className="text-[10px] font-mono text-slate-500 uppercase font-bold mb-1">
                        {vatSummary.vat_payable >= 0 ? 'Net VAT Payable' : 'Net VAT Refund Due'}
                      </p>
                      <p className="text-[10px] text-slate-500 mb-2 max-w-xs leading-tight">
                        {vatSummary.vat_payable >= 0 ? 'Difference between what you owe and what you can claim. Pay this amount to SARS.' : 'Difference between what you owe and what you can claim. SARS owes you this amount.'}
                      </p>
                      <h3 className={`font-mono text-3xl font-bold ${vatSummary.vat_payable >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {fmt(Math.abs(vatSummary.vat_payable))}
                      </h3>
                   </div>
                   <span className="material-symbols-outlined text-4xl text-slate-700 opacity-50">receipt_long</span>
                </div>
             </div>
          </div>
        )}

        {/* AGED DEBTORS TAB */}
        {activeTab === 'debtors' && debtors && (
          <div className="space-y-6">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <BucketKPI label="Current (0-30)" value={fmt(debtors.totals.current)} desc="Invoices issued recently. Not yet a concern." />
                <BucketKPI label="31-60 Days" value={fmt(debtors.totals['31-60'])} warning desc="Slightly overdue. Gentle reminder needed." />
                <BucketKPI label="61-90 Days" value={fmt(debtors.totals['61-90'])} alert desc="Significantly overdue. Follow up required." />
                <BucketKPI label="90+ Days" value={fmt(debtors.totals['90+'])} critical desc="Seriously overdue. High risk of non-payment." />
                <BucketKPI label="Total Owed" value={fmt(debtors.totals.total_outstanding)} total desc="Total amount clients owe you right now." />
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="lg:col-span-1 bg-surface border border-border-subtle p-6 rounded-3xl">
                   <h3 className="font-display text-lg font-bold text-slate-100 mb-4">Aging Breakdown</h3>
                   <div className="h-[200px] w-full">
                     <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={[
                         { name: 'Current', val: debtors.totals.current, fill: '#10b981' },
                         { name: '31-60', val: debtors.totals['31-60'], fill: '#f59e0b' },
                         { name: '61-90', val: debtors.totals['61-90'], fill: '#f97316' },
                         { name: '90+', val: debtors.totals['90+'], fill: '#f43f5e' }
                       ]}>
                         <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                         <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} />
                         <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(v) => `R${v/1000}k`} />
                         <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} itemStyle={{ color: '#f1f5f9', fontFamily: 'monospace', fontSize: '12px' }} />
                         <Bar dataKey="val" radius={[4, 4, 0, 0]} />
                       </BarChart>
                     </ResponsiveContainer>
                   </div>
                </div>
             </div>

             <div className="bg-surface border border-border-subtle rounded-3xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="bg-surface-muted/50 border-b border-border-subtle">
                         <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Client</th>
                         <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest text-right">Outstanding</th>
                         <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest text-center">Days Overdue</th>
                         <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest text-right">Status</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800">
                      {debtors.lines.map(line => (
                        <tr key={line.invoice_id} className="hover:bg-surface-muted/30 transition-colors">
                           <td className="px-6 py-4">
                              <p className="text-sm font-bold text-slate-200">{line.client_name}</p>
                              <p className="text-[10px] font-mono text-slate-500">{line.invoice_number}</p>
                           </td>
                           <td className="px-6 py-4 text-right font-mono text-sm font-bold text-slate-200">
                              {fmt(line.outstanding)}
                           </td>
                           <td className="px-6 py-4 text-center">
                              <span className={`text-[10px] font-mono font-bold ${line.days_outstanding > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                                 {line.days_outstanding > 0 ? `${line.days_outstanding} DAYS` : 'NOT DUE'}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <span className={`px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase ${
                                 line.bucket === 'current' ? 'bg-emerald-500/10 text-emerald-500' :
                                 line.bucket === '31-60' ? 'bg-amber-500/10 text-amber-500' :
                                 'bg-rose-500/10 text-rose-500'
                              }`}>
                                 {line.bucket}
                              </span>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {/* EXPENSE REPORT TAB */}
        {activeTab === 'expenses' && expenseReport && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPI card={{ label: 'Total Gross', value: fmt(expenseReport.totals.total_gross), color: 'text-white', desc: 'Total expenses including VAT.' }} />
              <KPI card={{ label: 'Total VAT', value: fmt(expenseReport.totals.total_vat), color: 'text-amber-400', desc: 'VAT paid on these expenses.' }} />
              <KPI card={{ label: 'Total Net', value: fmt(expenseReport.totals.total_net), color: 'text-slate-400', desc: 'Actual business cost (excluding VAT).' }} />
              <KPI card={{ label: 'Records', value: expenseReport.totals.expense_count.toString(), color: 'text-primary', desc: 'Total number of expense entries.' }} />
            </div>

            <div className="bg-surface border border-border-subtle rounded-3xl overflow-hidden">
               <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="bg-surface-muted/50 border-b border-border-subtle">
                        <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Merchant / Date</th>
                        <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Category</th>
                        <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest text-right">Gross Amount</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                     {expenseReport.lines.map(line => (
                       <tr key={line.expense_id} className="hover:bg-surface-muted/30 transition-colors">
                          <td className="px-6 py-4">
                             <p className="text-sm font-bold text-slate-200">{line.merchant}</p>
                             <p className="text-[10px] font-mono text-slate-500">{line.expense_date}</p>
                          </td>
                          <td className="px-6 py-4">
                             <span className="px-2 py-1 rounded bg-slate-800 text-[9px] font-mono font-bold uppercase text-slate-400">
                                {line.category.replace(/_/g, ' ')}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-sm font-bold text-slate-200">
                             {fmt(line.amount)}
                          </td>
                       </tr>
                     ))}
                     {expenseReport.lines.length === 0 && (
                        <tr>
                           <td colSpan={3} className="px-6 py-12 text-center text-slate-600 font-mono text-[10px] uppercase">No expenses recorded</td>
                        </tr>
                     )}
                  </tbody>
               </table>
            </div>
          </div>
        )}

        {/* INVOICE SUMMARY TAB */}
        {activeTab === 'invoices' && invoiceSummary && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPI card={{ label: 'Total Invoiced', value: fmt(invoiceSummary.totals.total_invoiced), color: 'text-white', desc: 'Total value of all invoices issued.' }} />
              <KPI card={{ label: 'Outstanding', value: fmt(invoiceSummary.totals.total_outstanding), color: 'text-rose-400', desc: 'Amount still waiting to be paid.' }} />
              <KPI card={{ label: 'Paid', value: fmt(invoiceSummary.totals.total_paid), color: 'text-emerald-400', desc: 'Amount successfully collected.' }} />
              <KPI card={{ label: 'Count', value: invoiceSummary.totals.invoice_count.toString(), color: 'text-primary', desc: 'Number of invoices issued.' }} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 bg-surface border border-border-subtle p-6 rounded-3xl">
                   <h3 className="font-display text-lg font-bold text-slate-100 mb-4">Invoice Status Mix</h3>
                   <div className="h-[200px] w-full">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                         <Pie
                           data={Object.entries(invoiceSummary.totals.by_status).map(([name, value]) => ({ name, value }))}
                           cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey="value"
                         >
                           {Object.keys(invoiceSummary.totals.by_status).map((_, index) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                         </Pie>
                         <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                   <div className="mt-4 space-y-2">
                     {Object.entries(invoiceSummary.totals.by_status).map(([name, value], i) => (
                       <div key={name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <span className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                             <span className="text-[9px] font-mono text-slate-400 uppercase">{name}</span>
                          </div>
                          <span className="text-[9px] font-mono text-white font-bold">{value}</span>
                       </div>
                     ))}
                   </div>
                </div>
            </div>

            <div className="bg-surface border border-border-subtle rounded-3xl overflow-hidden mt-6">
               <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="bg-surface-muted/50 border-b border-border-subtle">
                        <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">Invoice / Client</th>
                        <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest text-center">Status</th>
                        <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest text-right">Outstanding</th>
                        <th className="px-6 py-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest text-right">Total</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                     {invoiceSummary.lines.map(line => (
                       <tr key={line.invoice_id} className="hover:bg-surface-muted/30 transition-colors">
                          <td className="px-6 py-4">
                             <p className="text-sm font-bold text-slate-200">{line.invoice_number}</p>
                             <p className="text-[10px] font-mono text-slate-500">{line.client_name}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                             <span className={`px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase ${
                                line.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-500' :
                                line.status === 'OVERDUE' ? 'bg-rose-500/10 text-rose-500' :
                                'bg-primary/10 text-primary'
                             }`}>
                                {line.status}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-sm font-bold text-rose-400/80">
                             {line.amount_due > 0 ? fmt(line.amount_due) : '—'}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-sm font-bold text-slate-200">
                             {fmt(line.total)}
                          </td>
                       </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function KPI({ card }: { card: any }) {
  return (
    <div className="bg-surface border border-border-subtle p-5 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition-all">
       <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">{card.label}</p>
       <h3 className={`font-mono text-lg font-bold tracking-tight ${card.color}`}>
          {card.value}
       </h3>
       {card.desc && (
         <p className="text-[10px] text-slate-500 mt-2 leading-tight">{card.desc}</p>
       )}
       <div className="absolute right-[-10px] bottom-[-10px] opacity-10 blur-xl size-12 bg-white rounded-full group-hover:scale-150 transition-transform" />
    </div>
  );
}

function BucketKPI({ label, value, warning, alert, critical, total, desc }: any) {
  const borderColor = 
    critical ? 'border-rose-500/30' : 
    alert ? 'border-orange-500/30' : 
    warning ? 'border-amber-500/30' : 
    total ? 'border-primary' : 'border-border-subtle';
  
  const textColor = 
    critical ? 'text-rose-400' : 
    alert ? 'text-orange-400' : 
    warning ? 'text-amber-400' : 
    total ? 'text-primary' : 'text-slate-100';

  return (
    <div className={`bg-surface border ${borderColor} p-4 rounded-2xl flex flex-col justify-between h-full`}>
       <div>
         <p className="text-[8px] font-mono text-slate-500 uppercase font-bold mb-1">{label}</p>
         <p className={`font-mono text-sm font-bold ${textColor}`}>{value}</p>
       </div>
       {desc && <p className="text-[9px] text-slate-500 mt-3 leading-tight">{desc}</p>}
    </div>
  );
}

function Row({ label, value, sub, bold, muted, highlight, desc }: any) {
  return (
    <div className={`flex items-start justify-between ${sub ? 'pl-4' : ''}`}>
       <div>
         <span className={`text-[11px] uppercase tracking-wider font-mono block ${muted ? 'text-slate-600' : 'text-slate-400'} ${bold ? 'font-bold text-slate-200' : ''}`}>
            {label}
         </span>
         {desc && <span className="text-[9px] text-slate-500 block mt-0.5">{desc}</span>}
       </div>
       <span className={`text-xs font-mono mt-0.5 ${highlight ? 'text-emerald-400' : 'text-slate-300'} ${bold ? 'font-bold' : ''}`}>
          {value}
       </span>
    </div>
  );
}
