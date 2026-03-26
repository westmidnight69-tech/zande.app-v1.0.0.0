/**
 * Utility to wrap Supabase calls and handle concurrency/lock errors gracefully.
 *
 * Primary fix: supabase.ts now uses sessionStorage with a per-tab unique key,
 * which eliminates the root cause of the Web Locks "steal" AbortError.
 *
 * This wrapper provides a secondary safety net: if an AbortError somehow
 * slips through, it is absorbed and a safe empty result is returned so the
 * UI degrades gracefully instead of crashing.
 */
export async function safeRequest<T>(
  requestFn: () => PromiseLike<T>,
  retries = 2,
  delay = 300
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await requestFn();
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);

      const isLockError =
        msg.includes('Lock broken') ||
        msg.includes('AbortError') ||
        err?.name === 'AbortError';

      if (isLockError) {
        console.warn(`[safeRequest] Lock/Abort error (attempt ${i + 1}/${retries}). Suppressing gracefully.`);
        // Return a Supabase-shaped empty result so callers don't crash.
        // The sessionStorage auth fix in supabase.ts is the real prevention.
        return { data: null, error: { message: msg, code: 'LOCK_ERROR' } } as unknown as T;
      }

      // For all other errors, retry with backoff.
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}
