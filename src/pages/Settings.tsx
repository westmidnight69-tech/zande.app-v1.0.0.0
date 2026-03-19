import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Input, Select, PrimaryButton } from '../components/FormInputs';

interface BusinessProfile {
  id: string;
  name: string;
  tax_id: string;
  logo_url: string;
  is_vat_registered: boolean;
  financial_year_end: string;
}

export default function Settings() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', 'f5f31969-fc3f-41f8-bafa-652a37015f39') // Assuming single business for now
      .single();
    
    if (data) setProfile(data);
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('businesses')
      .update(profile)
      .eq('id', profile.id);
    
    if (error) alert(error.message);
    else {
      setActiveSection(null);
      alert('Profile updated successfully');
    }
    setSaving(false);
  }

  const renderSectionHeader = (title: string, icon: string) => (
    <div className="px-6 py-4 flex items-center gap-4 bg-surface/50 border-b border-border-subtle cursor-pointer transition-colors hover:bg-surface/80" onClick={() => setActiveSection(activeSection === title ? null : title)}>
      <div className="size-10 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <h3 className="font-display text-xs font-bold tracking-[0.15em] text-slate-400 uppercase">{title}</h3>
      <span className="material-symbols-outlined ml-auto text-slate-700 transition-transform duration-300" style={{ transform: activeSection === title ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
    </div>
  );

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Control</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Global System Configuration</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all">
            <span className="material-symbols-outlined text-[20px]">save</span>
          </button>
        </div>
      </header>

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Business Profile */}
        <div className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden group">
          {renderSectionHeader('BUSINESS PROFILE', 'business')}
          {activeSection === 'BUSINESS PROFILE' && (
            <div className="p-6 space-y-6 animate-in slide-in-from-top-2 duration-300">
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <Input 
                  label="Legal Entity Name" 
                  value={profile?.name || ''} 
                  onChange={(e) => setProfile(p => p ? {...p, name: e.target.value} : null)}
                />
                <Input 
                  label="Tax ID / Registration Number" 
                  value={profile?.tax_id || ''} 
                  onChange={(e) => setProfile(p => p ? {...p, tax_id: e.target.value} : null)}
                />
                <Input 
                  label="Logo URL" 
                  placeholder="https://..."
                  value={profile?.logo_url || ''} 
                  onChange={(e) => setProfile(p => p ? {...p, logo_url: e.target.value} : null)}
                />
                <PrimaryButton disabled={saving}>
                  {saving ? 'Syncing...' : 'Save Changes'}
                </PrimaryButton>
              </form>
            </div>
          )}
        </div>

        {/* Financial Config */}
        <div className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden group">
          {renderSectionHeader('FINANCIAL CONFIG', 'account_balance')}
          {activeSection === 'FINANCIAL CONFIG' && (
            <div className="p-6 space-y-6 animate-in slide-in-from-top-2 duration-300">
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <Input 
                  label="Financial Year End" 
                  type="date"
                  value={profile?.financial_year_end || ''} 
                  onChange={(e) => setProfile(p => p ? {...p, financial_year_end: e.target.value} : null)}
                />
                <Select 
                  label="VAT Registration Status"
                  options={[{value: 'true', label: 'Registered'}, {value: 'false', label: 'Not Registered'}]}
                  value={profile?.is_vat_registered ? 'true' : 'false'}
                  onChange={(e) => setProfile(p => p ? {...p, is_vat_registered: e.target.value === 'true'} : null)}
                />
                <PrimaryButton disabled={saving}>
                  {saving ? 'Syncing...' : 'Save Changes'}
                </PrimaryButton>
              </form>
            </div>
          )}
        </div>

        {/* Other Sections (Static for now) */}
        {[
          { title: 'INVOICING DEFAULTS', icon: 'description', items: ['Numbering Sequences', 'Payment Terms', 'Legal Footnotes'] },
          { title: 'TEAM & ACCESS', icon: 'group', items: ['User Roles', 'Security Logs'] }, // Removed API Access Tokens as requested
          { title: 'SUBSCRIPTION', icon: 'workspace_premium', items: ['Plan Details', 'Billing History', 'Payment Methods'] }
        ].map(section => (
          <div key={section.title} className="bg-surface/30 border border-border-subtle rounded-2xl overflow-hidden group grayscale opacity-60">
             <div className="px-6 py-4 flex items-center gap-4 bg-surface/50 border-b border-border-subtle cursor-not-allowed">
                <div className="size-10 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center text-slate-500">
                  <span className="material-symbols-outlined text-[20px]">{section.icon}</span>
                </div>
                <h3 className="font-display text-xs font-bold tracking-[0.15em] text-slate-600 uppercase">{section.title}</h3>
                <span className="text-[8px] font-mono text-slate-700 ml-auto uppercase tracking-widest font-bold">Planned</span>
             </div>
          </div>
        ))}
      </div>

      {/* Sign Out Section */}
      <div className="mt-12 pt-12 border-t border-border-subtle/50">
         <button className="w-full py-4 border border-status-overdue/30 bg-status-overdue/5 text-status-overdue rounded-2xl font-display font-bold text-xs tracking-widest uppercase hover:bg-status-overdue hover:text-black transition-all">
           Terminate Session
         </button>
         <p className="text-[9px] font-mono text-slate-700 text-center mt-4 tracking-widest uppercase">Version 1.4.2 Production Build</p>
      </div>
    </div>
  );
}
