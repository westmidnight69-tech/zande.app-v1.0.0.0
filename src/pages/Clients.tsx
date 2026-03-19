import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ClientSkeleton, Skeleton } from '../components/Skeleton';
import Modal from '../components/Modal';
import { Input, PrimaryButton, SecondaryButton } from '../components/FormInputs';
import { useAuth } from '../components/AuthProvider';
import { logAuditAction } from '../lib/audit';

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  vat_number: string | null;
  total_outstanding: number;
}

export default function Clients() {
  const { business, user, sessionId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Interaction State
  const [sortBy, setSortBy] = useState<'name' | 'balance'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Add Client State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', vat_number: '' });

  useEffect(() => {
    fetchClients();
  }, [sortBy, sortOrder]);

  async function fetchClients() {
    if (!business?.id) return;
    setLoading(true);
    const sortColumn = sortBy === 'name' ? 'name' : 'total_outstanding';
    
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('business_id', business.id)
      .order(sortColumn, { ascending: sortOrder === 'asc' });
    
    if (error) setError(error.message);
    else setClients(data || []);
    setLoading(false);
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    
    if (!business?.id) return;
    const { data: clientData, error } = await supabase
      .from('clients')
      .insert([{
        ...newClient,
        business_id: business.id,
        created_by: user?.id,
        session_id: sessionId
      }])
      .select()
      .single();

    if (error) {
      alert(error.message);
    } else {
      // Log Audit
      await logAuditAction({
        business_id: business.id,
        user_id: user?.id || '',
        session_id: sessionId,
        action: 'CREATE',
        entity_type: 'CLIENT',
        entity_id: clientData.id,
        new_data: clientData
      });

      fetchClients(); // Re-fetch to apply sort/order
      setIsModalOpen(false);
      setNewClient({ name: '', email: '', phone: '', vat_number: '' });
    }
    setIsSubmitting(false);
  }

  const handleSortToggle = () => {
    if (sortBy === 'name') setSortBy('balance');
    else setSortBy('name');
    setPage(1);
  };

  const handleOrderToggle = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    setPage(1);
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const paginatedClients = filteredClients.slice(0, page * pageSize);
  const hasMore = filteredClients.length > paginatedClients.length;

  const totalOutstanding = clients.reduce((sum, c) => sum + Number(c.total_outstanding || 0), 0);
  const fmt = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Clients</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Accounts Receivable</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSortToggle}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-subtle bg-surface/50 text-slate-400 hover:text-white transition-all group"
          >
            <span className="material-symbols-outlined text-[18px]">
              {sortBy === 'name' ? 'person' : 'account_balance_wallet'}
            </span>
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest">
              {sortBy === 'name' ? 'Name' : 'Balance'}
            </span>
          </button>
          <button 
            onClick={handleOrderToggle}
            className="size-10 rounded-full flex items-center justify-center text-slate-400 border border-border-subtle bg-surface/50 hover:text-primary transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">
              {sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
            </span>
          </button>
        </div>
      </header>

      {/* Summary Card */}
      <section className="mb-8">
        <div className="bg-surface border border-border-subtle p-6 rounded-2xl relative overflow-hidden group">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">Total Outstanding</p>
          {loading ? <Skeleton className="w-32 h-8" /> : (
            <h2 className="font-mono text-3xl font-bold text-white tracking-tight">{fmt(totalOutstanding)}</h2>
          )}
          <div className="absolute right-0 top-0 bottom-0 w-2 bg-primary opacity-80" />
        </div>
      </section>

      {/* Search Bar */}
      <div className="relative mb-8 group">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-primary transition-colors">search</span>
        <input 
          type="text" 
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface border border-border-subtle rounded-2xl py-4 pl-12 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-primary/50 transition-all"
        />
      </div>

      {/* Client List */}
      <div className="space-y-4">
        {loading && Array.from({ length: 6 }).map((_, i) => <ClientSkeleton key={i} />)}
        
        {error && (
          <div className="p-4 rounded-xl bg-status-overdue/10 border border-status-overdue/30 text-status-overdue font-mono text-sm">
            {error}
          </div>
        )}

        {!loading && !error && filteredClients.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6 grayscale opacity-40">
             <div className="size-20 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-4xl text-slate-500">person_off</span>
             </div>
             <p className="text-slate-500 text-sm max-w-[200px] leading-relaxed">
               {searchQuery ? 'No clients match your search.' : 'Your client directory is empty.'}
             </p>
          </div>
        )}

        {paginatedClients.map(client => (
          <div key={client.id} className="bg-surface border border-border-subtle p-4 rounded-xl hover:bg-surface-muted transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="size-11 rounded-lg bg-gradient-to-br from-surface-muted to-surface border border-border-subtle flex items-center justify-center flex-shrink-0 text-slate-400 font-display font-bold text-sm group-hover:text-primary transition-colors">
                {(client.name || '??').substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[15px] text-slate-100 truncate group-hover:text-white transition-colors capitalize">
                  {client.name}
                </h3>
                <p className="text-[10px] font-mono text-slate-500 truncate uppercase tracking-widest mt-0.5">
                  {client.email || 'NO EMAIL'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono text-sm font-bold text-white tracking-tight">
                  {fmt(Number(client.total_outstanding || 0))}
                </p>
                <div className="flex items-center justify-end gap-1 mt-1">
                   <div className={`size-1.5 rounded-full ${client.total_outstanding > 0 ? 'bg-status-overdue animate-pulse' : 'bg-emerald-500'}`} />
                   <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">
                     {client.total_outstanding > 0 ? 'Balance' : 'Clear'}
                   </p>
                </div>
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
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]">Load More Clients</span>
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

      {/* Add Client Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Register New Client"
        footer={
          <div className="flex gap-4">
            <SecondaryButton onClick={() => setIsModalOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton 
              onClick={handleAddClient} 
              disabled={isSubmitting || !newClient.name}
            >
              {isSubmitting ? 'Registering...' : 'Create Client'}
            </PrimaryButton>
          </div>
        }
      >
        <form className="space-y-6">
          <Input 
            label="Legal Name / Business Name" 
            placeholder="e.g. Acme Corp" 
            required
            value={newClient.name}
            onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
          />
          <Input 
            label="Email Address" 
            placeholder="billing@client.com"
            type="email"
            value={newClient.email}
            onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Phone Number" 
              placeholder="+27..."
              value={newClient.phone}
              onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
            />
            <Input 
              label="Tax / VAT Number" 
              placeholder="e.g. 4012345678"
              value={newClient.vat_number}
              onChange={(e) => setNewClient({ ...newClient, vat_number: e.target.value })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
