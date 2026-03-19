import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DocumentSkeleton } from '../components/Skeleton';
import Modal from '../components/Modal';
import { Input, Select, SecondaryButton } from '../components/FormInputs';
import { useAuth } from '../components/AuthProvider';
import { logAuditAction } from '../lib/audit';

interface Document {
  id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  document_type: string;
  public_url: string | null;
  created_at: string;
}

export default function Documents() {
  const { business, user, sessionId } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState('ALL');

  // Upload State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({
    document_type: 'OTHER',
    description: ''
  });

  useEffect(() => {
    fetchDocs();
  }, [activeType]);

  async function fetchDocs() {
    if (!business?.id) return;
    setLoading(true);
    let query = supabase
      .from('documents')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    
    if (activeType !== 'ALL') {
      query = query.eq('document_type', activeType);
    }
    
    const { data, error } = await query;
    if (error) setError(error.message);
    else setDocs(data || []);
    setLoading(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    if (!business?.id) {
      alert('Business information not loaded. Please try again.');
      setUploading(false);
      return;
    }
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${business.id}/${newDoc.document_type.toLowerCase()}s/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts') // Using receipts bucket as primary doc store
      .upload(filePath, file);

    if (uploadError) {
      alert('Error uploading document: ' + uploadError.message);
    } else {
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);
      
        const { data: docData, error: dbError } = await supabase
          .from('documents')
          .insert([{
            filename: fileName,
            original_filename: file.name,
            file_size: file.size,
            mime_type: file.type,
            document_type: newDoc.document_type,
            storage_bucket: 'receipts',
            storage_path: filePath,
            public_url: publicUrl,
            description: newDoc.description,
            business_id: business.id,
            uploaded_by: user?.id,
            session_id: sessionId
          }])
          .select()
          .single();

        if (dbError) {
          alert('File uploaded but database sync failed: ' + dbError.message);
        } else {
          // Log Audit
          await logAuditAction({
            business_id: business.id,
            user_id: user?.id || '',
            session_id: sessionId,
            action: 'UPLOAD',
            entity_type: 'DOCUMENT',
            entity_id: docData.id,
            new_data: docData
          });

          setIsModalOpen(false);
          fetchDocs();
          setNewDoc({ document_type: 'OTHER', description: '' });
        }
    }
    setUploading(false);
  }

  const totalSize = docs.reduce((sum, d) => sum + d.file_size, 0);
  const fmtSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Vault</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Encrypted Document Storage</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="size-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface hover:text-slate-100 transition-all border border-border-subtle"
          >
            <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
          </button>
        </div>
      </header>

      {/* Storage Indicator */}
      <section className="mb-8">
        <div className="bg-surface border border-border-subtle p-5 rounded-2xl relative overflow-hidden group">
          <div className="flex justify-between items-end mb-3">
             <div>
                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-1">Storage Used</p>
                <h2 className="font-mono text-xl font-bold text-white tracking-tight">{fmtSize(totalSize)}</h2>
             </div>
             <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">of 1GB Personal Tier</p>
          </div>
          <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
             <div 
               className="h-full bg-primary transition-all duration-1000" 
               style={{ width: `${Math.min((totalSize / (1024*1024*1024)) * 100, 100)}%` }} 
             />
          </div>
        </div>
      </section>

      {/* Quick Filters */}
      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar">
        {['ALL', 'INVOICE_PDF', 'RECEIPT', 'BANK_STATEMENT', 'OTHER'].map(type => (
          <button 
            key={type}
            onClick={() => setActiveType(type)}
            className={`px-4 py-2 rounded-xl border text-[10px] font-bold font-display tracking-widest transition-all ${
              activeType === type ? 'bg-primary text-black border-primary' : 'bg-surface/50 border-border-subtle text-slate-500 hover:text-slate-300'
            }`}
          >
            {type.replace('_PDF', '')}
          </button>
        ))}
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {loading && Array.from({ length: 5 }).map((_, i) => <DocumentSkeleton key={i} />)}
        
        {!loading && !error && docs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6 grayscale opacity-40">
            <div className="size-20 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-4xl text-slate-500">folder_open</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-100 mb-2">Vault is empty</h2>
            <p className="text-slate-500 text-sm max-w-[200px] leading-relaxed mb-8">Store your important business documents securely.</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined font-bold text-[20px]">upload_file</span>
              Upload File
            </button>
          </div>
        )}

        {docs.map(doc => (
          <div key={doc.id} className="bg-surface border border-border-subtle p-4 rounded-xl hover:bg-surface-muted transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="size-11 rounded-lg bg-surface-muted border border-border-subtle flex items-center justify-center flex-shrink-0 text-slate-600 group-hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[24px]">
                  {doc.mime_type.includes('pdf') ? 'picture_as_pdf' : 
                   doc.mime_type.includes('image') ? 'image' : 'description'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-slate-100 truncate group-hover:text-white">
                  {doc.original_filename}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest truncate">
                    {fmtSize(doc.file_size)}
                  </p>
                  <span className="size-1 rounded-full bg-slate-800" />
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest truncate">
                    {new Date(doc.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>
              {doc.public_url && (
                <a 
                  href={doc.public_url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="size-9 rounded-full flex items-center justify-center text-slate-700 hover:bg-surface hover:text-primary transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                </a>
              )}
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

      {/* Upload Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Secure Upload"
        footer={
          <div className="flex gap-4">
            <SecondaryButton onClick={() => setIsModalOpen(false)}>Cancel</SecondaryButton>
          </div>
        }
      >
        <div className="space-y-6">
           <Select 
             label="Document Type"
             options={[
               { value: 'OTHER', label: 'General Document' },
               { value: 'INVOICE_PDF', label: 'Invoice (PDF)' },
               { value: 'RECEIPT', label: 'Receipt' },
               { value: 'BANK_STATEMENT', label: 'Bank Statement' }
             ]}
             value={newDoc.document_type}
             onChange={(e) => setNewDoc({ ...newDoc, document_type: e.target.value })}
           />
           <Input 
             label="Description (Optional)"
             placeholder="Short description of the file..."
             value={newDoc.description}
             onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })}
           />

           <div className="relative">
              <input 
                type="file" 
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={uploading}
              />
              <div className="border-2 border-dashed border-border-subtle rounded-2xl py-12 flex flex-col items-center justify-center gap-4 group hover:border-primary/50 transition-all bg-surface/30">
                 {uploading ? (
                    <div className="size-8 border-4 border-primary border-t-transparent animate-spin rounded-full" />
                 ) : (
                    <span className="material-symbols-outlined text-5xl text-slate-700 group-hover:text-primary transition-colors">upload_file</span>
                 )}
                 <div className="text-center">
                    <p className="text-sm font-bold text-slate-300 mb-1">
                      {uploading ? 'Vaulting file...' : 'Select File to Secure'}
                    </p>
                    <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Max size 25MB • PDF, JPG, PNG</p>
                 </div>
              </div>
           </div>
        </div>
      </Modal>
    </div>
  );
}
