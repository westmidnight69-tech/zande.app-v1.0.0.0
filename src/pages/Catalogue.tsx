import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';
import Modal from '../components/Modal';
import { Input, PrimaryButton, SecondaryButton } from '../components/FormInputs';

interface CatalogueItem {
  id: string;
  name: string;
  description: string;
  unit_price: number;
  category: string;
  created_at: string;
}

export default function Catalogue() {
  const { business } = useAuth();
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogueItem | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unit_price: '',
    category: ''
  });

  useEffect(() => {
    if (business) {
      fetchItems();
    }
  }, [business]);

  async function fetchItems() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('catalogue_items')
        .select('*')
        .eq('business_id', business?.id)
        .order('name');

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching catalogue items:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenModal = (item?: CatalogueItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        description: item.description || '',
        unit_price: item.unit_price.toString(),
        category: item.category || ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        description: '',
        unit_price: '',
        category: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    try {
      setIsSubmitting(true);
      const payload = {
        business_id: business.id,
        name: formData.name,
        description: formData.description,
        unit_price: parseFloat(formData.unit_price) || 0,
        category: formData.category
      };

      if (editingItem) {
        const { error } = await supabase
          .from('catalogue_items')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('catalogue_items')
          .insert([payload]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchItems();
    } catch (err) {
      console.error('Error saving catalogue item:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      const { error } = await supabase
        .from('catalogue_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchItems();
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Catalogue</h1>
          <p className="text-slate-500 mt-1">Manage your products and services</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-2xl font-display font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-primary/20 active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Add New Item
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-surface border border-border-subtle rounded-3xl p-6 h-48 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-3xl p-12 text-center">
          <div className="size-16 bg-surface-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-slate-500 text-3xl">inventory_2</span>
          </div>
          <h3 className="text-xl font-display font-bold text-white mb-2">No items found</h3>
          <p className="text-slate-500 mb-8 max-w-sm mx-auto">Your catalogue is empty. Add products or services to quickly create invoices.</p>
          <button
            onClick={() => handleOpenModal()}
            className="text-primary font-display font-bold text-xs uppercase tracking-widest hover:text-white transition-colors"
          >
            Create your first item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div 
              key={item.id} 
              className="group bg-surface border border-border-subtle rounded-3xl p-6 hover:border-primary/50 transition-all duration-300 relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[24px]">inventory_2</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleOpenModal(item)}
                    className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-surface-muted hover:text-white"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-500/10 hover:text-red-500"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-white mb-1 truncate">{item.name}</h3>
              <p className="text-sm text-slate-500 mb-4 line-clamp-2 min-h-[2.5rem]">{item.description || 'No description'}</p>
              
              <div className="flex items-center justify-between pt-4 border-t border-border-subtle/50">
                <div className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                  {item.category || 'General'}
                </div>
                <div className="text-xl font-display font-bold text-primary">
                  R {item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Item' : 'Add New Item'}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Item Name"
            placeholder="e.g. Website Hosting"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <div className="space-y-1.5 w-full">
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold px-1">
              Description
            </label>
            <textarea
              className="w-full bg-white border border-border-subtle rounded-xl px-4 py-3 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-[100px] resize-none"
              placeholder="Detailed description of the product or service"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Unit Price (R)"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.unit_price}
              onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
              required
            />
            <Input
              label="Category"
              placeholder="e.g. Services"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <SecondaryButton type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingItem ? 'Update Item' : 'Create Item'}
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
