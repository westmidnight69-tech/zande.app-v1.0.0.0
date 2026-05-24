import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useCachedQuery } from '../lib/cache';
import { ExpenseSkeleton, Skeleton } from '../components/Skeleton';
import Modal from '../components/Modal';
import { Input, Select, PrimaryButton, SecondaryButton } from '../components/FormInputs';
import { useAuth } from '../components/AuthProvider';
import { logAuditAction } from '../lib/audit';
import { ledgerService } from '../lib/ledger';

interface Expense {
  id: string;
  description: string;
  supplier: string | null;
  amount: number;
  category: string;
  expense_date: string;
  payment_method: string | null;
  reference: string | null;
  receipt_url: string | null;
  is_void?: boolean;
  voided_at?: string | null;
  void_reason?: string | null;
}

// Default built-in categories (from the DB enum)
const DEFAULT_CATEGORIES = [
  'COST_OF_SALES', 'SALARIES', 'RENT', 'UTILITIES', 'MARKETING',
  'TRAVEL', 'EQUIPMENT', 'PROFESSIONAL_FEES', 'OFFICE_SUPPLIES',
  'MEALS', 'SUBSCRIPTIONS', 'BANK_CHARGES', 'INSURANCE', 'TAX', 'OTHER'
];

/* ─── Combobox: searchable dropdown with inline "Add new" ─── */
function ComboBox({ label, value, onChange, options, placeholder, icon }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  );
  const showAddNew = search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="space-y-1.5 w-full" ref={ref}>
      <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold px-1">
        {label}
      </label>
      <div className="relative">
        <div
          className="w-full bg-white border border-border-subtle rounded-xl px-4 py-3 text-sm text-black flex items-center gap-2 cursor-pointer hover:border-primary/40 transition-all"
          onClick={() => setOpen(!open)}
        >
          {icon && <span className="material-symbols-outlined text-[18px] text-slate-400">{icon}</span>}
          <span className={value ? 'text-black' : 'text-slate-400'}>
            {value ? formatLabel(value) : (placeholder || 'Select...')}
          </span>
          <span className="material-symbols-outlined text-slate-400 ml-auto text-[20px]">
            {open ? 'expand_less' : 'expand_more'}
          </span>
        </div>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl shadow-black/20 z-50 max-h-56 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Search input */}
            <div className="p-2 border-b border-slate-100">
              <input
                autoFocus
                className="w-full bg-slate-50 rounded-lg px-3 py-2 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder={`Search or type new...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="overflow-y-auto max-h-40">
              {/* Add new option */}
              {showAddNew && (
                <button
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-emerald-50 text-emerald-600 font-medium transition-colors"
                  onClick={() => {
                    onChange(search.trim().toUpperCase().replace(/\s+/g, '_'));
                    setSearch('');
                    setOpen(false);
                  }}
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  Add "{search.trim()}"
                </button>
              )}

              {/* Clear selection */}
              {value && (
                <button
                  className="w-full px-4 py-2 text-left text-[11px] font-mono text-slate-400 uppercase tracking-wider hover:bg-slate-50 transition-colors"
                  onClick={() => { onChange(''); setSearch(''); setOpen(false); }}
                >
                  Clear selection
                </button>
              )}

              {/* Existing options */}
              {filtered.map(opt => (
                <button
                  key={opt}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${opt === value ? 'bg-slate-100 font-medium text-black' : 'text-slate-700'}`}
                  onClick={() => { onChange(opt); setSearch(''); setOpen(false); }}
                >
                  {opt === value && <span className="material-symbols-outlined text-[14px] text-primary">check</span>}
                  {formatLabel(opt)}
                </button>
              ))}

              {filtered.length === 0 && !showAddNew && (
                <p className="px-4 py-3 text-sm text-slate-400 text-center">No matches</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bOf\b/g, 'of');
}

export default function Expenses() {
  const { business, user, sessionId } = useAuth();
  const [activeCategory, setActiveCategory] = useState('ALL');

  // Interaction State
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Add Expense State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: '',
    supplier: '',
    amount: '',
    category: 'OTHER',
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'CASH',
    receipt_url: ''
  });

  // Lookup lists (from DB)
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [descriptionOptions, setDescriptionOptions] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  // Merged category list = defaults + custom
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...customCategories])];

  // SWR Caching for main expense list
  const fetcher = useCallback(async () => {
    if (!business?.id) return [];
    const sortColumn = sortBy === 'date' ? 'expense_date' : 'amount';

    let query = api.query('expenses')
      .eq('business_id', business.id)
      .order(sortColumn, { ascending: sortOrder === 'asc' });

    if (activeCategory !== 'ALL') {
      query = query.eq('category', activeCategory);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }, [business?.id, sortBy, sortOrder, activeCategory]);

  const cacheKey = business?.id ? `expenses:list:${business.id}:${sortBy}:${sortOrder}:${activeCategory}` : null;
  const { data: expenses = [], loading, error: queryError } = useCachedQuery<Expense[]>(cacheKey, fetcher);
  const error = queryError ? (queryError as any).message : null;

  useEffect(() => {
    fetchLookups();
  }, [business?.id]);

  async function fetchLookups() {
    if (!business?.id) return;

    // Fetch saved suppliers
    const { data: suppliers } = await api.query('expense_suppliers', 'name')
      .eq('business_id', business.id)
      .order('name');
    if (suppliers) setSupplierOptions(suppliers.map((s: any) => s.name));

    // Fetch saved descriptions
    const { data: descriptions } = await api.query('expense_descriptions', 'text')
      .eq('business_id', business.id)
      .order('text');
    if (descriptions) setDescriptionOptions(descriptions.map((d: any) => d.text));

    // Fetch custom categories
    const { data: cats } = await api.query('expense_categories', 'name')
      .eq('business_id', business.id)
      .order('name');
    if (cats) setCustomCategories(cats.map((c: any) => c.name));
  }

  async function saveLookupIfNew(table: string, field: string, value: string) {
    if (!business?.id || !value.trim()) return;
    await api.upsert(table,
      { business_id: business.id, [field]: value.trim() },
      { onConflict: `business_id,${field}` }
    );
  }

  const paginatedExpenses = expenses.slice(0, page * pageSize);
  const hasMore = expenses.length > paginatedExpenses.length;

  const handleSortToggle = () => {
    if (sortBy === 'date') setSortBy('amount');
    else setSortBy('date');
    setPage(1);
  };

  const handleOrderToggle = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    setPage(1);
  };

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `receipts/${fileName}`;

    const { error: uploadError } = await api.upload('receipts', filePath, file);

    if (uploadError) {
      alert('Error uploading receipt: ' + uploadError.message);
    } else {
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);
      
      setNewExpense({ ...newExpense, receipt_url: publicUrl });
    }
    setUploading(false);
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    
    const amountNum = parseFloat(newExpense.amount);
    const vatRate = 15; // Standard VAT rate
    const vatAmount = amountNum * (vatRate / 115); // Assuming inclusive
    const netAmount = amountNum - vatAmount;

    if (!business?.id) return;
    const { data: expenseData, error } = await api.insert('expenses', {
      ...newExpense,
      amount: amountNum,
      vat_amount: vatAmount,
      net_amount: netAmount,
      vat_rate: vatRate,
      vat_claimable: true,
      business_id: business.id,
      created_by: user?.id,
      session_id: sessionId
    })
    .select()
    .single();

    if (error) {
      alert(error.message);
    } else {
      // Save lookups for future reuse
      await Promise.all([
        saveLookupIfNew('expense_suppliers', 'name', newExpense.supplier),
        saveLookupIfNew('expense_descriptions', 'text', newExpense.description),
      ]);

      // Save custom category if it's not a default one
      if (!DEFAULT_CATEGORIES.includes(newExpense.category)) {
        await saveLookupIfNew('expense_categories', 'name', newExpense.category);
      }

      // Log Audit
      await logAuditAction({
        business_id: business.id,
        user_id: user?.id || '',
        session_id: sessionId,
        action: 'CREATE',
        entity_type: 'EXPENSE',
        entity_id: expenseData.id,
        new_data: expenseData
      });

      // Post to Ledger
      try {
        await ledgerService.postExpense(business.id, expenseData);
      } catch (ledgerError) {
        console.error('Ledger posting failed:', ledgerError);
      }

      fetchLookups(); // Refresh dropdown options
      setIsModalOpen(false);
      setNewExpense({
        description: '',
        supplier: '',
        amount: '',
        category: 'OTHER',
        expense_date: new Date().toISOString().split('T')[0],
        payment_method: 'CASH',
        receipt_url: ''
      });
    }
    setIsSubmitting(false);
  }

  async function handleVoidExpense(expenseId: string) {
    if (!business?.id) return;
    if (!confirm('Are you sure you want to void this expense? It will be treated as R0.00 in all reports.')) return;

    const { error } = await api.update('expenses', { is_void: true, voided_at: new Date().toISOString() })
      .eq('id', expenseId)
      .eq('business_id', business.id);

    if (error) {
      alert('Failed to void expense: ' + error.message);
    } else {
      await logAuditAction({
        business_id: business.id,
        user_id: user?.id || '',
        session_id: sessionId,
        action: 'VOID',
        entity_type: 'EXPENSE',
        entity_id: expenseId,
        new_data: { is_void: true }
      });
    }
  }

  const currentMonthStr = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const totalThisMonth = expenses
    .filter(e => e.expense_date?.startsWith(currentMonthStr) && !e.is_void)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const fmt = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-100 tracking-tight">Expenses</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Spending & Procurement</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSortToggle}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-subtle bg-surface/50 text-slate-400 hover:text-white transition-all group"
          >
            <span className="material-symbols-outlined text-[18px]">
              {sortBy === 'date' ? 'calendar_today' : 'payments'}
            </span>
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest">
              {sortBy === 'date' ? 'Date' : 'Amount'}
            </span>
          </button>
          <button 
            onClick={handleOrderToggle}
            className="size-10 rounded-full flex items-center justify-center text-slate-400 border border-border-subtle bg-surface/50 hover:text-status-expenses transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">
              {sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
            </span>
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-surface border border-border-subtle p-5 rounded-2xl relative overflow-hidden group">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-1">Monthly Burn</p>
          {loading ? <Skeleton className="w-24 h-6" /> : (
            <h2 className="font-mono text-xl font-bold text-white tracking-tight">{fmt(totalThisMonth)}</h2>
          )}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-status-expenses opacity-80" />
        </div>
        <div className="bg-surface border border-border-subtle p-5 rounded-2xl relative overflow-hidden group">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-1">Receipts</p>
          {loading ? <Skeleton className="w-16 h-6" /> : (
            <h2 className="font-mono text-xl font-bold text-white tracking-tight">
              {expenses.filter(e => !e.receipt_url).length} <span className="text-[10px] text-slate-500 ml-1 uppercase">missing</span>
            </h2>
          )}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-status-overdue opacity-80" />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
        <button
          onClick={() => setActiveCategory('ALL')}
          className={`px-4 py-2 rounded-full text-[10px] font-bold font-display tracking-wider whitespace-nowrap transition-all border ${
            activeCategory === 'ALL'
              ? 'bg-status-expenses text-black border-status-expenses shadow-lg shadow-status-expenses/10'
              : 'bg-surface/50 text-slate-500 border-border-subtle hover:border-slate-700'
          }`}
        >
          ALL
        </button>
        {allCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-full text-[10px] font-bold font-display tracking-wider whitespace-nowrap transition-all border ${
              activeCategory === cat
                ? 'bg-status-expenses text-black border-status-expenses shadow-lg shadow-status-expenses/10'
                : 'bg-surface/50 text-slate-500 border-border-subtle hover:border-slate-700'
            }`}
          >
            {cat.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Expense List */}
      <div className="space-y-3">
        {loading && Array.from({ length: 6 }).map((_, i) => <ExpenseSkeleton key={i} />)}
        
        {error && (
          <div className="p-4 rounded-xl bg-status-overdue/10 border border-status-overdue/30 text-status-overdue font-mono text-sm">
            {error}
          </div>
        )}

        {!loading && !error && expenses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="size-20 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mb-6 group">
              <span className="material-symbols-outlined text-4xl text-slate-700 group-hover:scale-110 transition-transform">receipt_long</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-100 mb-2">
              No expenses logged
            </h2>
            <p className="text-slate-500 text-sm max-w-[200px] leading-relaxed mb-8">
              Keep track of your business spending by logging your first expense.
            </p>
          </div>
        )}

        {!loading && !error && paginatedExpenses.map(expense => (
          <div key={expense.id} className={`bg-surface border p-4 rounded-xl transition-all group ${
            expense.is_void 
              ? 'border-status-overdue/20 opacity-60' 
              : 'border-border-subtle hover:bg-surface-muted cursor-pointer'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`size-11 rounded-lg border flex items-center justify-center flex-shrink-0 transition-colors ${
                expense.is_void
                  ? 'bg-status-overdue/10 border-status-overdue/20 text-status-overdue'
                  : 'bg-surface-muted border-border-subtle text-slate-600 group-hover:text-status-expenses'
              }`}>
                <span className="material-symbols-outlined">
                  {expense.is_void ? 'block' :
                   expense.category === 'TRAVEL' ? 'flight' : 
                   expense.category === 'MEALS' ? 'restaurant' :
                   expense.category === 'SUBSCRIPTIONS' ? 'rebase' : 'payments'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`font-semibold text-sm truncate ${expense.is_void ? 'text-slate-500 line-through' : 'text-slate-100 group-hover:text-white'}`}>
                    {expense.supplier || expense.description}
                  </h3>
                  {expense.is_void && (
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase tracking-widest bg-status-overdue/15 text-status-overdue border border-status-overdue/20 flex-shrink-0">
                      Void
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest truncate">
                    {new Date(expense.expense_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  </p>
                  <span className="size-1 rounded-full bg-slate-800" />
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest truncate">
                    {expense.category.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 flex items-center gap-3">
                <div>
                  <p className={`font-mono text-sm font-bold tracking-tight ${expense.is_void ? 'text-slate-600 line-through' : 'text-white'}`}>
                    {fmt(expense.amount)}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    {expense.receipt_url ? (
                      <a href={expense.receipt_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors">
                        <span className="material-symbols-outlined text-[14px]">visibility</span>
                        <span className="text-[8px] font-mono font-bold uppercase tracking-widest">Receipt</span>
                      </a>
                    ) : (
                      <span className="material-symbols-outlined text-[12px] text-slate-700">no_photography</span>
                    )}
                  </div>
                </div>
                {!expense.is_void && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVoidExpense(expense.id); }}
                    className="size-8 rounded-lg flex items-center justify-center text-slate-700 hover:text-status-overdue hover:bg-status-overdue/10 transition-all opacity-0 group-hover:opacity-100"
                    title="Void this expense"
                  >
                    <span className="material-symbols-outlined text-[18px]">cancel</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {hasMore && (
           <button 
             onClick={() => setPage(page + 1)}
             className="w-full py-6 border border-dashed border-border-subtle rounded-xl text-slate-500 hover:text-white hover:bg-surface-muted transition-all flex flex-col items-center gap-2 group"
           >
              <span className="material-symbols-outlined text-xl group-hover:rotate-180 transition-transform duration-500">expand_more</span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]">Load More Expenses</span>
           </button>
        )}
      </div>

      {/* FAB */}
      <div className="fixed bottom-24 right-6 lg:bottom-12 lg:right-12 z-50">
        <button 
          onClick={() => setIsModalOpen(true)}
          className="size-16 bg-white text-black rounded-full flex items-center justify-center shadow-2xl shadow-white/10 hover:scale-110 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-4xl font-bold">add</span>
        </button>
      </div>

      {/* Log Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Log Business Expense"
        footer={
          <div className="flex gap-4">
            <SecondaryButton onClick={() => setIsModalOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton 
              onClick={handleAddExpense}
              disabled={isSubmitting || !newExpense.description || !newExpense.amount || uploading}
            >
              {isSubmitting ? 'Saving...' : 'Confirm Expense'}
            </PrimaryButton>
          </div>
        }
      >
        <form className="space-y-6">
          {/* Description ComboBox */}
          <ComboBox
            label="Description"
            value={newExpense.description}
            onChange={(v) => setNewExpense({ ...newExpense, description: v })}
            options={descriptionOptions}
            placeholder="What was this for?"
            icon="description"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Supplier ComboBox */}
            <ComboBox
              label="Supplier"
              value={newExpense.supplier}
              onChange={(v) => setNewExpense({ ...newExpense, supplier: v })}
              options={supplierOptions}
              placeholder="Store / Vendor"
              icon="storefront"
            />
            <Input 
              label="Amount" 
              type="number"
              placeholder="0.00"
              required
              value={newExpense.amount}
              onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category ComboBox */}
            <ComboBox
              label="Category"
              value={newExpense.category}
              onChange={(v) => setNewExpense({ ...newExpense, category: v || 'OTHER' })}
              options={allCategories}
              placeholder="Select category"
              icon="category"
            />
            <Input 
              label="Date"
              type="date"
              value={newExpense.expense_date}
              onChange={(e) => setNewExpense({ ...newExpense, expense_date: e.target.value })}
            />
          </div>
          
          {/* Receipt Upload */}
          <div className="bg-surface-muted border border-border-subtle p-4 rounded-xl">
             <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Attachment (Receipt)</p>
                {newExpense.receipt_url && (
                   <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-mono font-bold uppercase tracking-widest">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span> Uploaded
                   </div>
                )}
             </div>
             <div className="relative">
                <input 
                  type="file" 
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  disabled={uploading}
                />
                <div className="border-2 border-dashed border-border-subtle rounded-xl py-6 flex flex-col items-center justify-center gap-2 group hover:border-primary/30 transition-all">
                   {uploading ? (
                      <div className="size-5 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                   ) : (
                      <span className="material-symbols-outlined text-2xl text-slate-600 group-hover:text-primary transition-colors">cloud_upload</span>
                   )}
                   <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest group-hover:text-slate-300">
                      {uploading ? 'Processing...' : 'Click or Drag receipt'}
                   </p>
                </div>
             </div>
          </div>

          <Select 
            label="Payment Method"
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'EFT', label: 'EFT / Bank Transfer' },
              { value: 'CARD', label: 'Credit Card' }
            ]}
            value={newExpense.payment_method}
            onChange={(e) => setNewExpense({ ...newExpense, payment_method: e.target.value })}
          />
        </form>
      </Modal>
    </div>
  );
}
