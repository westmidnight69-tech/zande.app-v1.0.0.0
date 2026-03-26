import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ExpenseSkeleton, Skeleton } from '../components/Skeleton';
import Modal from '../components/Modal';
import { Input, Select, PrimaryButton, SecondaryButton } from '../components/FormInputs';
import { useAuth } from '../components/AuthProvider';
import { logAuditAction } from '../lib/audit';

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  client: { name: string } | null;
  invoice: { invoice_number: string } | null;
  reference: string | null;
}

interface Client {
  id: string;
  name: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  amount_due: number;
}

export default function Payments() {
  const { business, user, sessionId } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Payment State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPayment, setNewPayment] = useState({
    client_id: '',
    invoice_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'EFT',
    reference: ''
  });

  const fetchPayments = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('payments')
      .select('*, client:clients(name), invoice:invoices(invoice_number)')
      .eq('business_id', business.id)
      .order('payment_date', { ascending: false });

    if (error) setError(error.message);
    else setPayments((data as any[]) || []);
    setLoading(false);
  };

  const fetchClients = async () => {
    if (!business?.id) return;
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('business_id', business.id)
      .order('name');
    if (data) setClients(data);
  };

  const fetchClientInvoices = async (clientId: string) => {
    if (!business?.id) return;
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, amount_due')
      .eq('client_id', clientId)
      .eq('business_id', business.id)
      .eq('status', 'SENT'); // Only fetch unpaid/sent invoices
    if (data) setInvoices(data);
  };

  useEffect(() => {
    fetchPayments();
    fetchClients();
  }, [business?.id]);

  useEffect(() => {
    if (newPayment.client_id) {
      fetchClientInvoices(newPayment.client_id);
    } else {
      setInvoices([]);
    }
  }, [newPayment.client_id, business?.id]);

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!newPayment.client_id || !newPayment.amount) return alert('Select a client and enter an amount');
    
    setIsSubmitting(true);
    
    if (!business?.id) return;
    // 1. Insert Payment
    const { data: paymentData, error: paymentError } = await supabase
      .from('payments')
      .insert([{
        ...newPayment,
        amount: parseFloat(newPayment.amount),
        business_id: business.id,
        created_by: user?.id,
        session_id: sessionId
      }])
      .select()
      .single();

    if (paymentError) {
      alert(paymentError.message);
    } else {
      // Log Audit
      await logAuditAction({
        business_id: business.id,
        user_id: user?.id || '',
        session_id: sessionId,
        action: 'CREATE',
        entity_type: 'PAYMENT',
        entity_id: paymentData.id,
        new_data: paymentData
      });

      // 2. Update Invoice Status if linked
      if (newPayment.invoice_id) {
        await supabase
          .from('invoices')
          .update({ status: 'PAID' })
          .eq('id', newPayment.invoice_id);
      }
      
      setIsModalOpen(false);
      fetchPayments();
      setNewPayment({
        client_id: '',
        invoice_id: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'EFT',
        reference: ''
      });
    }
    setIsSubmitting(false);
  }

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const fmt = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Payments</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Cash Inflow & Collections</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all">
            <span className="material-symbols-outlined text-[20px]">filter_list</span>
          </button>
        </div>
      </header>

      {/* Summary Card */}
      <section className="mb-8 group">
        <div className="bg-surface border border-border-subtle p-6 rounded-2xl relative overflow-hidden transition-all hover:border-border-subtle/80 text-center">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">Total Inbound (MTD)</p>
          {loading ? <Skeleton className="w-40 h-10 mx-auto" /> : (
            <h2 className="font-mono text-4xl font-bold text-white tracking-tight">{fmt(totalReceived)}</h2>
          )}
          <div className="absolute left-0 right-0 bottom-0 h-1 bg-primary opacity-80" />
        </div>
      </section>

      {/* Transaction List */}
      <div className="space-y-3">
        {loading && Array.from({ length: 6 }).map((_, i) => <ExpenseSkeleton key={i} />)}
        
        {error && (
          <div className="p-4 rounded-xl bg-status-overdue/10 border border-status-overdue/30 text-status-overdue font-mono text-sm leading-relaxed">
            {error}
          </div>
        )}

        {!loading && !error && payments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6 grayscale opacity-40">
            <div className="size-20 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-4xl text-slate-500">payments</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-100 mb-2">No payments recorded</h2>
            <p className="text-slate-500 text-sm max-w-[240px] leading-relaxed">Recorded client payments will appear here for reconciliation.</p>
          </div>
        )}

        {payments.map(payment => (
          <div key={payment.id} className="bg-surface border border-border-subtle p-4 rounded-xl hover:bg-surface-muted transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="size-11 rounded-lg bg-surface-muted border border-border-subtle flex items-center justify-center flex-shrink-0 text-slate-600 group-hover:text-primary transition-colors">
                <span className="material-symbols-outlined">account_balance_wallet</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-slate-100 truncate group-hover:text-white transition-colors">
                  {payment.client?.name || 'Manual Entry'}
                </h3>
                <p className="text-[10px] font-mono text-slate-500 truncate uppercase tracking-widest mt-0.5">
                  {payment.invoice ? payment.invoice.invoice_number : (payment.reference || 'No Ref')} • {new Date(payment.payment_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono text-sm font-bold text-primary tracking-tight">+{fmt(Number(payment.amount))}</p>
                <div className="flex items-center justify-end gap-1 mt-1">
                   <div className="size-1 rounded-full bg-emerald-500" />
                   <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">{payment.payment_method}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
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

      {/* Record Payment Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Client Payment"
        footer={
          <div className="flex gap-4">
            <SecondaryButton onClick={() => setIsModalOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton 
              onClick={handleAddPayment}
              disabled={isSubmitting || !newPayment.client_id || !newPayment.amount}
            >
              {isSubmitting ? 'Recording...' : 'Save Payment'}
            </PrimaryButton>
          </div>
        }
      >
        <form className="space-y-6">
          <Select 
            label="From Client"
            options={[{ value: '', label: 'Select Client' }, ...clients.map(c => ({ value: c.id, label: c.name }))]}
            value={newPayment.client_id}
            onChange={(e) => setNewPayment({ ...newPayment, client_id: e.target.value, invoice_id: '' })}
          />
          
          <Select 
            label="Link to Invoice (Optional)"
            disabled={!newPayment.client_id || invoices.length === 0}
            options={[
              { value: '', label: invoices.length === 0 ? 'No Unpaid Invoices' : 'Select Invoice' },
              ...invoices.map(i => ({ value: i.id, label: `${i.invoice_number} (${fmt(i.amount_due)})` }))
            ]}
            value={newPayment.invoice_id}
            onChange={(e) => {
              const inv = invoices.find(i => i.id === e.target.value);
              setNewPayment({ 
                ...newPayment, 
                invoice_id: e.target.value,
                amount: inv ? inv.amount_due.toString() : newPayment.amount
              });
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input 
              label="Amount Received" 
              type="number"
              placeholder="0.00"
              required
              value={newPayment.amount}
              onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
            />
            <Input 
              label="Payment Date"
              type="date"
              value={newPayment.payment_date}
              onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select 
              label="Method"
              options={[
                { value: 'EFT', label: 'EFT / Transfer' },
                { value: 'CARD', label: 'Credit Card' },
                { value: 'CASH', label: 'Cash' },
                { value: 'CHECK', label: 'Check' }
              ]}
              value={newPayment.payment_method}
              onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })}
            />
            <Input 
              label="Reference"
              placeholder="e.g. INV-1234"
              value={newPayment.reference}
              onChange={(e) => setNewPayment({ ...newPayment, reference: e.target.value })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
