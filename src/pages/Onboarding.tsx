import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { Input, Select, PrimaryButton } from '../components/FormInputs';

const entityTypes = [
  { value: 'PTY_LTD', label: 'Private Company (Pty Ltd)' },
  { value: 'SOLE_PROP', label: 'Sole Proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'TRUST', label: 'Trust' },
  { value: 'NPO', label: 'Non-Profit Organisation' }
];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    entity_type: 'PTY_LTD',
    registration_number: ''
  });

  useEffect(() => {
    // Check if the user already has a business
    async function checkExistingBusiness() {
      if (!user) return;
      const { data } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single();

      if (data) {
        // Business exists, go to dashboard
        navigate('/', { replace: true });
      } else {
        setChecking(false);
      }
    }

    checkExistingBusiness();
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name: formData.name,
          entity_type: formData.entity_type,
          registration_number: formData.registration_number,
          onboarding_complete: true,
          email: user.email // Set initial email contact to user email
        });

      if (error) throw error;

      navigate('/', { replace: true });
    } catch (error: any) {
      alert(error.message || 'Failed to create business profile.');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-primary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Welcome to Zande
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Let's set up your business profile to get started.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface/30 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-border-subtle">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <Input
              label="Legal Entity Name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            
            <Select
              label="Entity Type"
              options={entityTypes}
              value={formData.entity_type}
              onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
            />

            <Input
              label="Registration Number"
              type="text"
              placeholder="e.g. 2023/123456/07"
              value={formData.registration_number}
              onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
            />


            <div>
              <PrimaryButton disabled={loading}>
                {loading ? 'Creating Profile...' : 'Complete Setup'}
              </PrimaryButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
