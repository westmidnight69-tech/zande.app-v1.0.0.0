/**
 * Zande — Secure Client-Side Caching Layer
 *
 * Implements a lightweight, type-safe, in-memory Stale-While-Revalidate (SWR) cache
 * with instant UI synchronization, prefix invalidations, and security controls
 * against cross-session data leakage.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

// Pure in-memory cache to prevent writing sensitive financial data to local/session storage
const cacheStore = new Map<string, CacheEntry>();

type CacheEvent<T = any> = 
  | { type: 'update'; data: T }
  | { type: 'invalidate' }
  | { type: 'clear' };

type CacheListener = (key: string, event: CacheEvent) => void;
const listeners = new Set<CacheListener>();

/**
 * Fully clears the cache store and notifies all active listeners to purge their memory immediately.
 * Call this on logout or session change to prevent unauthorized cross-session data access.
 */
export function clearCache() {
  cacheStore.clear();
  for (const listener of listeners) {
    // Notify all active listeners using a dummy/empty key so they trigger immediate purge
    listener('*', { type: 'clear' });
  }
}

/**
 * Invalidates cache entries matching the specified prefix or pattern.
 * Active SWR hooks using invalidated keys will immediately trigger a background revalidation.
 */
export function invalidateCache(pattern: string) {
  const keysToInvalidate: string[] = [];

  for (const key of cacheStore.keys()) {
    // Perform exact, prefix, or wildcard match
    if (
      key === pattern || 
      key.startsWith(pattern + ':') || 
      (pattern.includes('*') && new RegExp('^' + pattern.replace(/\*/g, '.*') + '$').test(key))
    ) {
      keysToInvalidate.push(key);
    }
  }

  for (const key of keysToInvalidate) {
    cacheStore.delete(key);
    // Notify hooks that the key was invalidated so they can fetch fresh data
    for (const listener of listeners) {
      listener(key, { type: 'invalidate' });
    }
  }
}

export interface UseCachedQueryOptions {
  ttl?: number;      // Time to live in milliseconds (default: 5 minutes)
  enabled?: boolean;  // Conditional fetching
}

/**
 * Type-safe Stale-While-Revalidate query hook.
 * Renders stale data instantly if cached, and fetches fresh data in the background.
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<any>,
  options: UseCachedQueryOptions = {}
) {
  const { ttl = 5 * 60 * 1000, enabled = true } = options;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const isRevalidating = useRef(false);

  // Safely retrieve valid non-expired cache entries
  const getCachedValue = useCallback(() => {
    if (!key || !enabled) return undefined;
    const entry = cacheStore.get(key);
    if (!entry) return undefined;

    const isExpired = Date.now() - entry.timestamp > ttl;
    if (isExpired) return undefined;

    return entry.data as T;
  }, [key, enabled, ttl]);

  const [data, setData] = useState<T | undefined>(getCachedValue);
  const [loading, setLoading] = useState<boolean>(() => {
    if (!enabled || !key) return false;
    return !cacheStore.has(key);
  });
  const [error, setError] = useState<any>(null);

  const revalidate = useCallback(async (force = false) => {
    if (!key || !enabled) return;
    if (isRevalidating.current && !force) return;

    isRevalidating.current = true;
    try {
      const freshData = await fetcherRef.current();

      // Update in-memory cache
      cacheStore.set(key, {
        data: freshData,
        timestamp: Date.now(),
      });

      // Synchronize other mountings of this cache key
      for (const listener of listeners) {
        listener(key, { type: 'update', data: freshData });
      }

      setData(freshData);
      setError(null);
    } catch (err) {
      console.error(`Cache revalidation failed for key "${key}":`, err);
      setError(err);
    } finally {
      setLoading(false);
      isRevalidating.current = false;
    }
  }, [key, enabled]);

  // Handle manual/conditional mounting and key changes
  useEffect(() => {
    if (!key || !enabled) {
      setData(undefined);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = getCachedValue();
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
      // Quiet background refresh
      revalidate();
    } else {
      setData(undefined);
      setLoading(true);
      revalidate(true);
    }
  }, [key, enabled, getCachedValue, revalidate]);

  // Synchronize state across hooks and respond to cache invalidation/clear events
  useEffect(() => {
    if (!key || !enabled) return;

    const listener: CacheListener = (eventKey, event) => {
      // Handle security purge event
      if (event.type === 'clear') {
        setData(undefined);
        setLoading(false);
        setError(null);
        return;
      }

      if (eventKey !== key) return;

      if (event.type === 'update') {
        setData(event.data);
        setLoading(false);
        setError(null);
      } else if (event.type === 'invalidate') {
        // Trigger background refresh instantly on invalidation
        revalidate(true);
      }
    };

    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [key, enabled, revalidate]);

  return {
    data,
    loading,
    error,
    revalidate: useCallback(() => revalidate(true), [revalidate]),
  };
}
