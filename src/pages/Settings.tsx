import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { Input, PrimaryButton } from '../components/FormInputs';

interface BusinessProfile {
  id: string;
  name: string;
  tax_id: string;
  logo_url: string;
  phone: string;
  email: string;
  is_vat_registered: boolean;
  financial_year_end: string;
  invoice_prefix: string;
  payment_terms_days: number;
  invoice_footer_note: string;
}

type Toast = { type: 'success' | 'error'; message: string } | null;

export default function Settings() {
  const { business, refreshBusiness, signOut } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  // Populate profile from AuthProvider context (no extra fetch needed)
  useEffect(() => {
    if (business) {
      setProfile({
        id: business.id,
        name: business.name || '',
        tax_id: business.tax_id || '',
        logo_url: business.logo_url || '',
        phone: business.phone || '',
        email: business.email || '',
        is_vat_registered: business.is_vat_registered ?? false,
        financial_year_end: business.financial_year_end || '',
        invoice_prefix: business.invoice_prefix || 'INV',
        payment_terms_days: business.payment_terms_days ?? 14,
        invoice_footer_note: business.invoice_footer_note || 'Thank you for your business.',
      });
    }
  }, [business]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    const { error } = await supabase
      .from('businesses')
      .update({
        name: profile.name,
        tax_id: profile.tax_id,
        logo_url: profile.logo_url,
        phone: profile.phone,
        email: profile.email,
        is_vat_registered: profile.is_vat_registered,
        financial_year_end: profile.financial_year_end,
        invoice_prefix: profile.invoice_prefix,
        payment_terms_days: profile.payment_terms_days,
        invoice_footer_note: profile.invoice_footer_note,
      })
      .eq('id', profile.id);

    if (error) {
      showToast('error', error.message);
    } else {
      await refreshBusiness(); // Sync global context so invoices pick up VAT change instantly
      setActiveSection(null);
      showToast('success', 'Settings saved successfully.');
    }
    setSaving(false);
  }

  const set = (key: keyof BusinessProfile, value: string | boolean | number) =>
    setProfile(p => (p ? { ...p, [key]: value } : null));

  const renderSectionHeader = (title: string, icon: string) => (
    <div
      className="px-6 py-4 flex items-center gap-4 bg-surface/50 border-b border-border-subtle cursor-pointer transition-colors hover:bg-surface/80"
      onClick={() => setActiveSection(activeSection === title ? null : title)}
    >
      <div className="size-10 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <h3 className="font-display text-xs font-bold tracking-[0.15em] text-slate-400 uppercase">{title}</h3>
      <span
        className="material-symbols-outlined ml-auto text-slate-700 transition-transform duration-300"
        style={{ transform: activeSection === title ? 'rotate(90deg)' : 'none' }}
      >
        chevron_right
      </span>
    </div>
  );

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 left-6 right-6 sm:left-auto sm:right-6 sm:w-auto z-[100] px-5 py-3.5 rounded-2xl border text-xs sm:text-sm font-mono font-bold shadow-2xl animate-in slide-in-from-top-2 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-status-overdue/10 border-status-overdue/30 text-status-overdue'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[18px]">
              {toast.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span className="flex-1">{toast.message}</span>
          </div>
        </div>
      )}

      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-100 tracking-tight">Control</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">
            Global System Configuration
          </p>
        </div>
        {/* VAT status pill */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest ${
          profile?.is_vat_registered
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-slate-800/50 border-border-subtle text-slate-500'
        }`}>
          <span className={`size-1.5 rounded-full ${profile?.is_vat_registered ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          {profile?.is_vat_registered ? 'VAT Registered' : 'Non-VAT Vendor'}
        </div>
      </header>

      <div className="space-y-6">

        {/* ── BUSINESS PROFILE ── */}
        <div className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden">
          {renderSectionHeader('BUSINESS PROFILE', 'business')}
          {activeSection === 'BUSINESS PROFILE' && (
            <div className="p-6 animate-in slide-in-from-top-2 duration-300">
              <form onSubmit={handleSave} className="space-y-4">
                <Input
                  label="Legal Entity Name"
                  placeholder="e.g. Zande Holdings (Pty) Ltd"
                  value={profile?.name || ''}
                  onChange={e => set('name', e.target.value)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Phone Number"
                    type="tel"
                    placeholder="+27 82 000 0000"
                    value={profile?.phone || ''}
                    onChange={e => set('phone', e.target.value)}
                  />
                  <Input
                    label="Business Email"
                    type="email"
                    placeholder="billing@yourbusiness.com"
                    value={profile?.email || ''}
                    onChange={e => set('email', e.target.value)}
                  />
                </div>
                <Input
                  label="Tax ID / Registration Number"
                  placeholder="e.g. 2023/123456/07"
                  value={profile?.tax_id || ''}
                  onChange={e => set('tax_id', e.target.value)}
                />
                <Input
                  label="Logo URL"
                  placeholder="https://..."
                  value={profile?.logo_url || ''}
                  onChange={e => set('logo_url', e.target.value)}
                />
                <PrimaryButton disabled={saving}>
                  {saving ? 'Syncing...' : 'Save Profile'}
                </PrimaryButton>
              </form>
            </div>
          )}
        </div>

        {/* ── FINANCIAL CONFIG ── */}
        <div className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden">
          {renderSectionHeader('FINANCIAL CONFIG', 'account_balance')}
          {activeSection === 'FINANCIAL CONFIG' && (
            <div className="p-6 animate-in slide-in-from-top-2 duration-300 space-y-6">
              <form onSubmit={handleSave} className="space-y-4">
                <Input
                  label="Financial Year End"
                  type="date"
                  value={profile?.financial_year_end || ''}
                  onChange={e => set('financial_year_end', e.target.value)}
                />

                {/* VAT Toggle */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold px-1">
                    VAT Registration Status
                  </p>
                  <div
                    className="flex items-center justify-between bg-surface-muted border border-border-subtle rounded-xl px-4 py-3 cursor-pointer hover:border-border-subtle/80 transition-all group"
                    onClick={() => set('is_vat_registered', !profile?.is_vat_registered)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {profile?.is_vat_registered ? 'VAT Registered' : 'Not VAT Registered'}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                        {profile?.is_vat_registered
                          ? '15% VAT will be applied to all invoices'
                          : 'Invoices will not include VAT charges'}
                      </p>
                    </div>
                    {/* Toggle switch */}
                    <div className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${
                      profile?.is_vat_registered ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}>
                      <div className={`absolute top-1 size-4 rounded-full bg-white shadow transition-transform duration-300 ${
                        profile?.is_vat_registered ? 'translate-x-7' : 'translate-x-1'
                      }`} />
                    </div>
                  </div>

                  {profile?.is_vat_registered && (
                    <p className="text-[10px] font-mono text-emerald-400/70 px-1 flex items-center gap-1 animate-in fade-in duration-200">
                      <span className="material-symbols-outlined text-[12px]">info</span>
                      VAT number will appear on invoices and PDFs using your Tax ID above.
                    </p>
                  )}
                </div>

                <PrimaryButton disabled={saving}>
                  {saving ? 'Syncing...' : 'Save Financial Config'}
                </PrimaryButton>
              </form>
            </div>
          )}
        </div>

        {/* ── INVOICING DEFAULTS ── */}
        <div className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden">
          {renderSectionHeader('INVOICING DEFAULTS', 'description')}
          {activeSection === 'INVOICING DEFAULTS' && (
            <div className="p-6 animate-in slide-in-from-top-2 duration-300">
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Invoice Number Prefix"
                    placeholder="e.g. INV"
                    value={profile?.invoice_prefix || 'INV'}
                    onChange={e => set('invoice_prefix', e.target.value.toUpperCase())}
                  />
                  <Input
                    label="Default Payment Terms (Days)"
                    type="number"
                    placeholder="14"
                    value={profile?.payment_terms_days ?? 14}
                    onChange={e => set('payment_terms_days', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold px-1">
                    Invoice Footer / Legal Note
                  </label>
                  <textarea
                    className="w-full bg-white border border-border-subtle rounded-xl px-4 py-3 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                    rows={3}
                    placeholder="e.g. Payment is due within 14 days. Banking details: ..."
                    value={profile?.invoice_footer_note || ''}
                    onChange={e => set('invoice_footer_note', e.target.value)}
                  />
                </div>

                {/* Preview card */}
                <div className="bg-surface border border-border-subtle/40 rounded-xl p-4 space-y-1">
                  <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Invoice number preview</p>
                  <p className="font-mono text-sm text-primary font-bold">
                    {profile?.invoice_prefix || 'INV'}-000042
                  </p>
                  <p className="text-[9px] font-mono text-slate-600 mt-1">
                    Net {profile?.payment_terms_days ?? 14} days from invoice date
                  </p>
                </div>

                <PrimaryButton disabled={saving}>
                  {saving ? 'Syncing...' : 'Save Invoicing Defaults'}
                </PrimaryButton>
              </form>
            </div>
          )}
        </div>

        {/* ── TEAM & ACCESS (planned) ── */}
        <div className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden grayscale opacity-50">
          <div className="px-6 py-4 flex items-center gap-4 bg-surface/50 border-b border-border-subtle cursor-not-allowed">
            <div className="size-10 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center text-slate-500">
              <span className="material-symbols-outlined text-[20px]">group</span>
            </div>
            <h3 className="font-display text-xs font-bold tracking-[0.15em] text-slate-600 uppercase">Team & Access</h3>
            <span className="text-[8px] font-mono text-slate-700 ml-auto uppercase tracking-widest font-bold">Planned</span>
          </div>
        </div>

        {/* ── SUBSCRIPTION (planned) ── */}
        <div className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden grayscale opacity-50">
          <div className="px-6 py-4 flex items-center gap-4 bg-surface/50 border-b border-border-subtle cursor-not-allowed">
            <div className="size-10 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center text-slate-500">
              <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
            </div>
            <h3 className="font-display text-xs font-bold tracking-[0.15em] text-slate-600 uppercase">Subscription</h3>
            <span className="text-[8px] font-mono text-slate-700 ml-auto uppercase tracking-widest font-bold">Planned</span>
          </div>
        </div>

      </div>

      {/* ── SIGN OUT ── */}
      <div className="mt-12 pt-12 border-t border-border-subtle/50 space-y-4">
        <button
          onClick={() => signOut()}
          className="w-full py-4 border border-status-overdue/30 bg-status-overdue/5 text-status-overdue rounded-2xl font-display font-bold text-xs tracking-widest uppercase hover:bg-status-overdue hover:text-black transition-all active:scale-[0.98]"
        >
          Terminate Session
        </button>
        <p className="text-[9px] font-mono text-slate-700 text-center tracking-widest uppercase">
          {business?.name || 'Zande'} · Version 1.5.0 · Production Build
        </p>
      </div>
    </div>
  );
}
