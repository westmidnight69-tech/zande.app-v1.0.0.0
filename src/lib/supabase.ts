import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file.');
}

// Each browser tab gets its own isolated auth storage key.
// This prevents the Web Locks "steal" AbortError that occurs when multiple
// tabs/users share the same IndexedDB lock through the default Supabase storage.
// sessionStorage is tab-scoped by the browser — no cross-tab contention is possible.
const tabStorageKey = `zande-auth-${crypto.randomUUID()}`;

const sessionStorageAdapter = {
  getItem: (key: string) => sessionStorage.getItem(key),
  setItem: (key: string, value: string) => sessionStorage.setItem(key, value),
  removeItem: (key: string) => sessionStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorageAdapter,
    storageKey: tabStorageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
