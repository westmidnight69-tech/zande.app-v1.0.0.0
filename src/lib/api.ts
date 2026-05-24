/**
 * Zande — Rate-Limited API Wrappers
 *
 * Drop-in replacements for raw Supabase calls that enforce
 * client-side rate limits before the request leaves the browser.
 *
 * Usage:
 *   import { api } from '../lib/api';
 *   const { data, error } = await api.insert('invoices', payload);
 */

import { supabase } from './supabase';
import { rateLimiter, RateLimitError } from './rate-limiter';
import type { BucketName } from './rate-limiter';
import { sanitizePayload } from './sanitize';
import { invalidateCache } from './cache';

// ─── Cache Invalidation Trigger ──────────────────────────────────────────────

function triggerInvalidation(table: string) {
  invalidateCache(table);
  // Dashboard is a consolidated view of clients, invoices, expenses, payments
  if (['invoices', 'expenses', 'payments', 'clients'].includes(table)) {
    invalidateCache('dashboard:stats');
  }
}

function wrapWithInvalidation<T extends { then: any }>(builder: T, table: string): T {
  const originalThen = builder.then.bind(builder);
  builder.then = (onfulfilled?: any, onrejected?: any) => {
    return originalThen((res: any) => {
      if (res && !res.error) {
        triggerInvalidation(table);
      }
      return onfulfilled ? onfulfilled(res) : res;
    }, onrejected);
  };
  return builder;
}

// ─── Error Shaping ───────────────────────────────────────────────────────────

function rateLimitResponse(err: RateLimitError) {
  return {
    data: null,
    error: {
      message: err.message,
      code: 'RATE_LIMITED',
      details: `Retry after ${err.retryAfter}s`,
      hint: err.bucket,
    },
  };
}

// ─── Rate-Limited Wrappers ───────────────────────────────────────────────────

export const api = {
  /**
   * Rate-limited SELECT query.
   */
  query(table: string, selectColumns = '*') {
    try {
      rateLimiter.consume('read');
    } catch (err) {
      if (err instanceof RateLimitError) {
        // Return a thenable that matches Supabase's builder pattern
        return {
          ...rateLimitResponse(err),
          eq: () => rateLimitResponse(err),
          order: () => rateLimitResponse(err),
          limit: () => rateLimitResponse(err),
          single: () => rateLimitResponse(err),
          maybeSingle: () => rateLimitResponse(err),
        } as any;
      }
      throw err;
    }
    return supabase.from(table).select(selectColumns);
  },

  /**
   * Rate-limited INSERT.
   */
  insert(table: string, data: any) {
    try {
      rateLimiter.consume('write');
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          ...rateLimitResponse(err),
          select: () => rateLimitResponse(err),
          single: () => rateLimitResponse(err),
        } as any;
      }
      throw err;
    }
    const sanitizedData = sanitizePayload(data);
    return wrapWithInvalidation(supabase.from(table).insert(sanitizedData), table);
  },

  /**
   * Rate-limited UPDATE — returns a builder so callers can chain .eq().
   */
  update(table: string, data: any) {
    try {
      rateLimiter.consume('write');
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          ...rateLimitResponse(err),
          eq: () => rateLimitResponse(err),
          match: () => rateLimitResponse(err),
          select: () => rateLimitResponse(err),
          single: () => rateLimitResponse(err),
        } as any;
      }
      throw err;
    }
    const sanitizedData = sanitizePayload(data);
    return wrapWithInvalidation(supabase.from(table).update(sanitizedData), table);
  },

  /**
   * Rate-limited DELETE — returns a builder so callers can chain .eq().
   */
  delete(table: string) {
    try {
      rateLimiter.consume('write');
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          ...rateLimitResponse(err),
          eq: () => rateLimitResponse(err),
          match: () => rateLimitResponse(err),
        } as any;
      }
      throw err;
    }
    return wrapWithInvalidation(supabase.from(table).delete(), table);
  },

  /**
   * Rate-limited UPSERT — returns a builder so callers can chain .select().
   */
  upsert(table: string, data: any, options?: { onConflict?: string }) {
    try {
      rateLimiter.consume('write');
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          ...rateLimitResponse(err),
          select: () => rateLimitResponse(err),
          single: () => rateLimitResponse(err),
        } as any;
      }
      throw err;
    }
    const sanitizedData = sanitizePayload(data);
    return wrapWithInvalidation(supabase.from(table).upsert(sanitizedData, options), table);
  },

  /**
   * Rate-limited file upload.
   */
  async upload(bucket: string, path: string, file: File | Blob, options?: any) {
    try {
      rateLimiter.consume('upload');
    } catch (err) {
      if (err instanceof RateLimitError) return rateLimitResponse(err);
      throw err;
    }
    return supabase.storage.from(bucket).upload(path, file, options);
  },

  /**
   * Rate-limited auth sign-in.
   */
  async signIn(email: string, password: string) {
    try {
      rateLimiter.consume('auth');
    } catch (err) {
      if (err instanceof RateLimitError) {
        return { data: { user: null, session: null }, error: { message: err.message, status: 429 } };
      }
      throw err;
    }
    return supabase.auth.signInWithPassword({ email, password });
  },

  /**
   * Rate-limited auth sign-up.
   */
  async signUp(email: string, password: string) {
    try {
      rateLimiter.consume('auth');
    } catch (err) {
      if (err instanceof RateLimitError) {
        return { data: { user: null, session: null }, error: { message: err.message, status: 429 } };
      }
      throw err;
    }
    return supabase.auth.signUp({ email, password });
  },

  /**
   * Expose the limiter for manual checks (e.g., disabling buttons).
   */
  checkLimit(bucket: BucketName) {
    return rateLimiter.checkLimit(bucket);
  },
};
