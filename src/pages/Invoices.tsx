import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { InvoiceSkeleton, Skeleton } from '../components/Skeleton';
import Modal from '../components/Modal';
import { Input, Select, PrimaryButton, SecondaryButton } from '../components/FormInputs';

import { useAuth } from '../components/AuthProvider';
import { logAuditAction } from '../lib/audit';
import { MoreVertical, Share2, CheckCircle, Clock, FileEdit, XCircle, DownloadCloud, Eye } from 'lucide-react';
import { jsPDF } from 'jspdf';
import './Signup.css';


interface Invoice {
  id: string;
  invoice_number: string;
  client: { name: string } | null;
  amount_due: number;
  due_date: string;
  status: string;
}

interface Client {
  id: string;
  name: string;
}

interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  catalogue_item_id?: string;
}

interface CatalogueItem {
  id: string;
  name: string;
  description: string;
  unit_price: number;
}

export default function Invoices() {
  const { business, user, sessionId } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogueItems, setCatalogueItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('ALL');
  
  // Interaction State
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  
  // Invoice Actions State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  // New Invoice State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    client_id: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    status: 'SENT'
  });
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([{ description: '', quantity: 1, unit_price: 0 }]);

  // Handlers declared before use
  const fetchClients = async () => {
    if (!business?.id) return;
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('business_id', business.id)
      .order('name');
    if (data) setClients(data);
  };

  const fetchCatalogueItems = async () => {
    if (!business?.id) return;
    const { data } = await supabase
      .from('catalogue_items')
      .select('id, name, description, unit_price')
      .eq('business_id', business.id)
      .order('name');
    if (data) setCatalogueItems(data);
  };

  const fetchInvoices = async () => {
    if (!business?.id) return;
    setLoading(true);
    let query = supabase
      .from('invoices')
      .select('*, client:clients(name)')
      .eq('business_id', business.id);

    // Filtering
    if (activeTab !== 'ALL') {
      query = query.eq('status', activeTab);
    }

    // Sorting
    const sortColumn = sortBy === 'date' ? 'created_at' : 'amount_due';
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

    const { data, error } = await query;
    if (error) setError(error.message);
    else setInvoices((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (business?.id) {
      fetchClients();
      fetchCatalogueItems();
    }
  }, [business?.id]);

  useEffect(() => {
    if (business?.id) {
      fetchInvoices();
    }
  }, [activeTab, sortBy, sortOrder, business?.id]);



  const paginatedInvoices = invoices.slice(0, page * pageSize);
  const hasMore = invoices.length > paginatedInvoices.length;

  const handleSortToggle = () => {
    if (sortBy === 'date') setSortBy('amount');
    else setSortBy('date');
    setPage(1); // Reset pagination on sort
  };

  const handleOrderToggle = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    setPage(1);
  };

  async function updateInvoiceStatus(invoiceId: string, newStatus: string) {
    setIsProcessingId(invoiceId);
    
    // update in supabase
    const { error } = await supabase
      .from('invoices')
      .update({ status: newStatus })
      .eq('id', invoiceId);
      
    if (!error && business?.id) {
      // audit
      await logAuditAction({
        business_id: business.id,
        user_id: user?.id || '',
        session_id: sessionId,
        action: 'UPDATE',
        entity_type: 'invoice',
        entity_id: invoiceId,
        new_data: { status: newStatus }
      });
      // update local state
      setInvoices(invoices.map(inv => inv.id === invoiceId ? { ...inv, status: newStatus } : inv));
    } else if (error) {
      alert('Failed to update status');
    }
    
    setIsProcessingId(null);
    setActiveMenuId(null);
  }

  const generateAndStoreInvoicePDF = async (invoice: any) => {
    if (!business?.id) return null;
    
    const doc = new jsPDF();
    
    // Professional Header
    doc.setFillColor(31, 41, 55); // Dark Gray
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(business?.name || 'INVOICE', 20, 25);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Invoice Number:', 150, 15);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.invoice_number, 150, 22);
    
    // Client Information
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL TO:', 20, 55);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(invoice.client?.name || 'Valued Client', 20, 62);
    
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE DATE:', 150, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(invoice.issue_date || invoice.created_at).toLocaleDateString(), 150, 54);

    doc.setFont('helvetica', 'bold');
    doc.text('DUE DATE:', 150, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(invoice.due_date).toLocaleDateString(), 150, 68);
    
    // Table Header
    doc.setFillColor(243, 244, 246);
    doc.rect(20, 75, 170, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Description', 25, 81);
    doc.text('Qty', 120, 81);
    doc.text('Rate', 145, 81);
    doc.text('Total', 175, 81);
    
    // Items
    let y = 92;
    doc.setFont('helvetica', 'normal');
    
    // Fetch line items if they are not already in the invoice object
    let lineItems = invoice.items;
    if (!lineItems || lineItems.length === 0) {
      const { data } = await supabase
        .from('line_items')
        .select('*')
        .eq('invoice_id', invoice.id)
        .order('sort_order');
      lineItems = data || [];
    }

    lineItems.forEach((item: any) => {
      doc.text(item.description, 25, y);
      doc.text(item.quantity.toString(), 120, y);
      doc.text(`R ${item.unit_price.toFixed(2)}`, 145, y);
      doc.text(`R ${(item.quantity * item.unit_price).toFixed(2)}`, 175, y);
      
      // Line separator
      doc.setDrawColor(229, 231, 235);
      doc.line(20, y + 4, 190, y + 4);
      y += 12;
    });
    
    // Totals
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Subtotal:', 145, y);
    doc.text(`R ${invoice.subtotal?.toFixed(2) || invoice.total.toFixed(2)}`, 175, y);
    
    y += 8;
    doc.text('VAT (15%):', 145, y);
    doc.text(`R ${invoice.vat_amount?.toFixed(2) || (invoice.total * 0.15).toFixed(2)}`, 175, y);

    y += 8;
    doc.text('Total Amount:', 145, y);
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text(`R ${invoice.total.toFixed(2)}`, 175, y);
    
    // Footer
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175);
    doc.text('Thank you for your business!', 105, 280, { align: 'center' });

    const pdfBlob = doc.output('blob');
    const safeInvNum = invoice.invoice_number.replace(/[^a-zA-Z0-9-]/g, '');
    const fileName = `${business.id}/invoices/${safeInvNum}_${Date.now()}.pdf`;
    
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(fileName);

    // Save metadata to documents table
    await supabase.from('documents').insert([{
      filename: fileName.split('/').pop(),
      original_filename: `${invoice.invoice_number}.pdf`,
      file_size: pdfBlob.size,
      mime_type: 'application/pdf',
      document_type: 'INVOICE_PDF',
      storage_bucket: 'receipts',
      storage_path: fileName,
      public_url: publicUrl,
      description: `Invoice ${invoice.invoice_number} for ${invoice.client?.name || 'Client'}`,
      business_id: business.id,
      uploaded_by: user?.id,
      session_id: sessionId
    }]);

    return { doc, publicUrl, pdfBlob };
  };

  const handleDownloadPDF = async (invoice: any) => {
    setIsProcessingId(invoice.id);
    setActiveMenuId(null);
    try {
      const result = await generateAndStoreInvoicePDF(invoice);
      if (result) {
        result.doc.save(`${invoice.invoice_number}.pdf`);
      }
    } catch (err: any) {
      console.error('Download failed:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setIsProcessingId(null);
    }
  };

  const handleViewPDF = async (invoice: any) => {
    setIsProcessingId(invoice.id);
    setActiveMenuId(null);
    try {
      const result = await generateAndStoreInvoicePDF(invoice);
      if (result) {
        window.open(result.publicUrl, '_blank');
      }
    } catch (err: any) {
      console.error('View failed:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setIsProcessingId(null);
    }
  };

  const handleShareInvoice = async (invoice: any) => {
    setIsProcessingId(invoice.id);
    setActiveMenuId(null);
    
    try {
      const result = await generateAndStoreInvoicePDF(invoice);
      if (!result) return;
      
      const message = `Hi ${invoice.client?.name || ''}, here is your invoice (${invoice.invoice_number}) for R${invoice.total.toFixed(2)}. View or download the PDF here: ${result.publicUrl}`;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Invoice ${invoice.invoice_number}`,
            text: message,
          });
        } catch (e) {
          console.log('Share API failed or user cancelled:', e);
          // Fallback if they cancel, we don't necessarily open whatsapp without asking, but we'll try it
        }
      } else {
        // Fallback for desktop Safari/Chrome if no share API
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      }
      
    } catch (err: any) {
      console.error('Sharing failed:', err);
      alert('Failed to generate and share PDF: ' + err.message);
    } finally {
      setIsProcessingId(null);
    }
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!isNewClient && !newInvoice.client_id) return alert('Select a client');
    if (isNewClient && !newClientName) return alert('Enter client name');
    
    setIsSubmitting(true);
    let clientId = newInvoice.client_id;

    // 0. Handle New Client Sync
    if (isNewClient) {
      if (!business?.id) return;
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .insert([{ 
          name: newClientName,
          business_id: business.id,
          created_by: user?.id,
          session_id: sessionId
        }])
        .select()
        .single();
      
      if (clientError) {
        alert('Failed to register new client: ' + clientError.message);
        setIsSubmitting(false);
        return;
      }
      clientId = clientData.id;
      fetchClients(); // Update local list
    }

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const vat = subtotal * 0.15;
    const total = subtotal + vat;

    // 1. Create Invoice
    if (!business?.id) return;
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert([{
        ...newInvoice,
        client_id: clientId,
        subtotal: subtotal,
        vat_amount: vat,
        total: total,
        amount_due: total,
        amount_paid: 0,
        status: newInvoice.status,
        issue_date: newInvoice.issue_date,
        business_id: business.id,
        created_by: user?.id,
        session_id: sessionId
      }])
      .select()
      .single();

    if (invoiceError) {
      alert(invoiceError.message);
      setIsSubmitting(false);
      return;
    }

    // Log Audit
    await logAuditAction({
      business_id: business.id,
      user_id: user?.id || '',
      session_id: sessionId,
      action: 'CREATE',
      entity_type: 'INVOICE',
      entity_id: invoiceData.id,
      new_data: invoiceData
    });

    // 2. Add Items
    const { error: itemsError } = await supabase
      .from('line_items')
      .insert(items.map((item, idx) => ({
        invoice_id: invoiceData.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.quantity * item.unit_price,
        vat_rate: 15,
        vat_amount: (item.quantity * item.unit_price) * 0.15,
        sort_order: idx + 1,
        catalogue_item_id: item.catalogue_item_id
      })));

    if (itemsError) {
      alert('Invoice created but items failed: ' + itemsError.message);
    } else {
      setIsModalOpen(false);
      fetchInvoices();
      // Reset
      setItems([{ description: '', quantity: 1, unit_price: 0 }]);
          setNewInvoice({
            client_id: '',
            issue_date: new Date().toISOString().split('T')[0],
            due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            invoice_number: `INV-${Date.now().toString().slice(-6)}`,
            status: 'SENT'
          });
        setIsNewClient(false);
        setNewClientName('');
      }
    setIsSubmitting(false);
  }

  const addItem = () => setItems([...items, { description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };
  const totalOutstanding = invoices
    .filter(i => i.status !== 'PAID')
    .reduce((sum, i) => sum + Number(i.amount_due), 0);

  const fmt = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Invoices</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Billing & Revenue</p>
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
            className="size-10 rounded-full flex items-center justify-center text-slate-400 border border-border-subtle bg-surface/50 hover:text-primary transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">
              {sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
            </span>
          </button>
        </div>
      </header>

      {/* Summary outstanding card */}
      <section className="mb-8 group">
        <div className="bg-surface border border-border-subtle p-6 rounded-2xl relative overflow-hidden transition-all hover:border-border-subtle/80">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">Total Outstanding</p>
          {loading ? <Skeleton className="w-32 h-8" /> : (
            <h2 className="font-mono text-3xl font-bold text-white tracking-tight">{fmt(totalOutstanding)}</h2>
          )}
          <div className="absolute right-0 top-0 bottom-0 w-2 bg-status-overdue opacity-80" />
        </div>
      </section>

      {/* Tabs */}
      <div className="flex gap-6 mb-8 border-b border-border-subtle/30 overflow-x-auto no-scrollbar">
        {['ALL', 'DRAFT', 'SENT', 'PAID', 'OVERDUE'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-4 text-[11px] font-bold font-display tracking-[0.2em] transition-all relative ${
              activeTab === tab ? 'text-primary' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-in fade-in slide-in-from-bottom-1" />
            )}
          </button>
        ))}
      </div>

      {/* Invoice List */}
      <div className="space-y-4">
        {loading && Array.from({ length: 6 }).map((_, i) => <InvoiceSkeleton key={i} />)}
        
        {error && (
          <div className="p-4 rounded-xl bg-status-overdue/10 border border-status-overdue/30 text-status-overdue font-mono text-sm leading-relaxed">
            {error}
          </div>
        )}

        {!loading && !error && invoices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6 grayscale opacity-40">
            <div className="size-20 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-4xl text-slate-500">description</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-100 mb-2">
              No {activeTab.toLowerCase()} invoices
            </h2>
            <p className="text-slate-500 text-sm max-w-[200px] leading-relaxed">
              When you create an invoice, it will appear here in your dashboard.
            </p>
          </div>
        )}

        {paginatedInvoices.map(invoice => (
          <div key={invoice.id} className="relative bg-surface border border-border-subtle p-4 rounded-xl hover:bg-surface-muted transition-all group">
            <div className="flex items-center gap-4">
              <div className="size-11 rounded-lg bg-surface-muted border border-border-subtle flex items-center justify-center flex-shrink-0 text-slate-600 group-hover:text-primary transition-colors cursor-pointer">
                <span className="material-symbols-outlined">receipt</span>
              </div>
              <div className="flex-1 min-w-0 cursor-pointer">
                <h3 className="font-semibold text-sm text-slate-100 truncate group-hover:text-white transition-colors">
                  {invoice.client?.name || 'Unknown Client'}
                </h3>
                <p className="text-[10px] font-mono text-slate-500 truncate uppercase tracking-widest mt-0.5">
                  {invoice.invoice_number} • {new Date(invoice.due_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div className="text-right flex-shrink-0 mr-4 cursor-pointer">
                <p className="font-mono text-sm font-bold text-white tracking-tight">{fmt(invoice.amount_due)}</p>
                <div className={`mt-1.5 px-2 py-0.5 rounded border text-[8px] font-mono font-bold uppercase tracking-widest inline-block status-${invoice.status.toLowerCase()}`}>
                  {invoice.status === 'PAID' ? 'SETTLED' : invoice.status === 'PARTIAL' ? 'PARTIALLY' : invoice.status}
                </div>
              </div>
              
              {/* Menu Button */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setActiveMenuId(activeMenuId === invoice.id ? null : invoice.id)}
                  disabled={isProcessingId === invoice.id}
                  className="p-2 -mr-2 text-slate-500 hover:text-white hover:bg-surface-muted rounded-full transition-colors disabled:opacity-50"
                >
                  {isProcessingId === invoice.id ? (
                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  ) : (
                    <MoreVertical className="w-5 h-5" />
                  )}
                </button>

                {/* Dropdown Menu */}
                {activeMenuId === invoice.id && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setActiveMenuId(null)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-border-subtle rounded-xl shadow-2xl z-50 overflow-hidden text-sm">
                      <div className="p-1">
                        <button 
                          onClick={() => updateInvoiceStatus(invoice.id, 'DRAFT')}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-surface-muted rounded-lg transition-colors"
                        >
                          <FileEdit className="w-4 h-4 text-slate-400" />
                          Mark as Draft
                        </button>
                        <button 
                          onClick={() => updateInvoiceStatus(invoice.id, 'PENDING')}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 rounded-lg transition-colors"
                        >
                          <Clock className="w-4 h-4" />
                          Mark as Pending
                        </button>
                        <button 
                          onClick={() => updateInvoiceStatus(invoice.id, 'PAID')}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 rounded-lg transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Mark as Paid
                        </button>
                        <button 
                          onClick={() => updateInvoiceStatus(invoice.id, 'VOID')}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-400/10 rounded-lg transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Void Invoice
                        </button>
                      </div>
                      <div className="h-px bg-border-subtle" />
                      <div className="p-1">
                        <button 
                          onClick={() => handleViewPDF(invoice)}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          View PDF
                        </button>
                        <button 
                          onClick={() => handleDownloadPDF(invoice)}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-400/10 rounded-lg transition-colors"
                        >
                          <DownloadCloud className="w-4 h-4" />
                          Download PDF
                        </button>
                        <button 
                          onClick={() => handleShareInvoice(invoice)}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        >
                          <Share2 className="w-4 h-4" />
                          Share Invoice
                        </button>
                      </div>
                    </div>
                  </>
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
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]">Load More Transactions</span>
           </button>
        )}
      </div>

      {/* FAB */}
      <div className="fixed bottom-24 right-6 lg:bottom-12 lg:right-12 z-50">
        <button 
          onClick={() => setIsModalOpen(true)}
          className="size-16 bg-primary text-black rounded-full flex items-center justify-center shadow-2xl shadow-primary/20 hover:scale-110 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-4xl font-bold">add</span>
        </button>
      </div>

      {/* Create Invoice Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Generate New Invoice"
        footer={
          <div className="flex gap-4">
            <SecondaryButton onClick={() => setIsModalOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton 
              onClick={handleCreateInvoice}
              disabled={
                isSubmitting || 
                (!isNewClient && !newInvoice.client_id) || 
                (isNewClient && !newClientName.trim()) || 
                items.some(i => !i.description.trim())
              }
            >
              {isSubmitting ? 'Generating...' : 'Confirm & Save'}
            </PrimaryButton>
          </div>
        }
      >
        <form className="space-y-8">
          {/* Header Info */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="col-span-2">
               {!isNewClient ? (
                 <div className="space-y-2">
                   <Select 
                      label="Select Client"
                      options={[
                        { value: '', label: 'Select Client' }, 
                        ...clients.map(c => ({ value: c.id, label: c.name })),
                        { value: 'NEW', label: '+ Add New Client' }
                      ]}
                      value={newInvoice.client_id}
                      onChange={(e) => {
                        if (e.target.value === 'NEW') {
                          setIsNewClient(true);
                        } else {
                          setNewInvoice({...newInvoice, client_id: e.target.value});
                        }
                      }}
                   />
                 </div>
               ) : (
                 <div className="space-y-2 animate-in slide-in-from-left-2 duration-300">
                   <div className="flex items-end gap-3">
                     <div className="flex-1">
                        <Input 
                           label="New Client Name" 
                           placeholder="Enter business name"
                           value={newClientName}
                           onChange={(e) => setNewClientName(e.target.value)}
                           autoFocus
                        />
                     </div>
                     <button 
                        type="button"
                        onClick={() => setIsNewClient(false)}
                        className="mb-1 size-11 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center text-slate-500 hover:text-white transition-all"
                     >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                     </button>
                   </div>
                 </div>
               )}
             </div>
             
             <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                   label="Invoice Number"
                   value={newInvoice.invoice_number}
                   onChange={(e) => setNewInvoice({...newInvoice, invoice_number: e.target.value})}
                />
                <Input 
                   label="Invoice Date"
                   type="date"
                   value={newInvoice.issue_date}
                   onChange={(e) => setNewInvoice({...newInvoice, issue_date: e.target.value})}
                />
             </div>
             
             <div className="col-span-2">
               <Input 
                  label="Due Date"
                  type="date"
                  value={newInvoice.due_date}
                  onChange={(e) => setNewInvoice({...newInvoice, due_date: e.target.value})}
               />
             </div>

             <div className="col-span-2">
               <Select 
                 label="Initial Status"
                 options={[
                   { value: 'DRAFT', label: 'Draft' },
                   { value: 'SENT', label: 'Sent (Pending)' },
                   { value: 'PAID', label: 'Paid (Settled)' }
                 ]}
                 value={newInvoice.status}
                 onChange={(e) => setNewInvoice({...newInvoice, status: e.target.value})}
               />
             </div>
          </section>

          {/* Line Items */}
          <section className="space-y-4">
             <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] font-bold">Line Items</h3>
                <button 
                  type="button"
                  onClick={addItem}
                  className="text-primary text-[10px] font-mono font-bold uppercase tracking-widest flex items-center gap-1 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span> Add Item
                </button>
             </div>
             
             <div className="space-y-3">
               {items.map((item, idx) => (
                 <div key={idx} className="bg-surface-muted border border-border-subtle p-4 rounded-xl space-y-3 relative group/item">
                    {items.length > 1 && (
                      <button 
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="absolute right-4 top-4 text-slate-700 hover:text-status-overdue transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    )}
                    <div className="space-y-3">
                      <Select 
                        label="Choose from Catalogue (Optional)"
                        options={[
                          { value: '', label: '-- Select Item --' },
                          ...catalogueItems.map(ci => ({ value: ci.id, label: `${ci.name} (R${ci.unit_price.toFixed(2)})` }))
                        ]}
                        value={item.catalogue_item_id || ''}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          const selectedItem = catalogueItems.find(ci => ci.id === selectedId);
                          const newItems = [...items];
                          newItems[idx].catalogue_item_id = selectedId;
                          if (selectedItem) {
                            newItems[idx].description = selectedItem.name;
                            newItems[idx].unit_price = selectedItem.unit_price;
                          }
                          setItems(newItems);
                        }}
                      />
                      <Input 
                        label="Description"
                        placeholder="Service or Product name"
                        value={item.description}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[idx].description = e.target.value;
                          setItems(newItems);
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input 
                         label="Qty"
                         type="number"
                         value={item.quantity}
                         onChange={(e) => {
                           const newItems = [...items];
                           newItems[idx].quantity = Number(e.target.value);
                           setItems(newItems);
                         }}
                      />
                      <Input 
                         label="Rate"
                         type="number"
                         value={item.unit_price}
                         onChange={(e) => {
                           const newItems = [...items];
                           newItems[idx].unit_price = Number(e.target.value);
                           setItems(newItems);
                         }}
                      />
                    </div>
                  </div>
               ))}
             </div>
          </section>

          {/* Totals Summary */}
          <section className="bg-surface p-6 rounded-2xl border border-border-subtle space-y-3">
             <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                <span>Subtotal</span>
                <span>{fmt(items.reduce((s, i) => s + (i.quantity * i.unit_price), 0))}</span>
             </div>
             <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                <span>VAT (15%)</span>
                <span>{fmt(items.reduce((s, i) => s + (i.quantity * i.unit_price), 0) * 0.15)}</span>
             </div>
             <div className="pt-3 border-t border-border-subtle flex justify-between items-center">
                <span className="font-display text-xs font-bold text-white uppercase tracking-widest">Total Amount</span>
                <span className="font-mono text-xl font-bold text-primary tracking-tight">
                  {fmt(items.reduce((s, i) => s + (i.quantity * i.unit_price), 0) * 1.15)}
                </span>
             </div>
          </section>
        </form>
      </Modal>
    </div>
  );
}
