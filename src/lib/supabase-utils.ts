/**
 * Utility to wrap Supabase calls and retry on common concurrency/lock errors
 * like "AbortError: Lock broken by another request with the 'steal' option."
 */
export async function safeRequest<T>(
  requestFn: () => PromiseLike<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await requestFn();
    } catch (err: any) {
      lastError = err;
      const errorMessage = err?.message || String(err);
      
      // Specifically target the "Lock broken" or "AbortError"
      if (errorMessage.includes('Lock broken') || errorMessage.includes('AbortError')) {
        console.warn(`Supabase lock conflict detected (attempt ${i + 1}/${retries}). Retrying...`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
          continue;
        }
      }
      
      throw err;
    }
  }
  
  throw lastError;
}
