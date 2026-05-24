/**
 * Zande — Client-Side Rate Limiter
 *
 * Token-bucket implementation that throttles API calls before they
 * leave the browser. Provides immediate user feedback and prevents
 * accidental runaway loops.
 *
 * This is the FIRST line of defense. The database-level rate limiter
 * (check_rate_limit function) is the real security boundary.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type BucketName = 'auth' | 'read' | 'write' | 'upload';

interface BucketConfig {
  maxTokens: number;     // Maximum requests allowed in the window
  windowMs: number;      // Time window in milliseconds
  label: string;         // Human-readable label for error messages
}

interface BucketState {
  tokens: number;        // Remaining tokens
  lastRefill: number;    // Timestamp of last refill
}

export class RateLimitError extends Error {
  public retryAfter: number;  // Seconds until the bucket refills
  public bucket: BucketName;

  constructor(bucket: BucketName, retryAfter: number, label: string) {
    super(`Rate limit exceeded for ${label}. Please wait ${retryAfter} seconds.`);
    this.name = 'RateLimitError';
    this.bucket = bucket;
    this.retryAfter = retryAfter;
  }
}

// ─── Configuration ───────────────────────────────────────────────────────────

const BUCKET_CONFIGS: Record<BucketName, BucketConfig> = {
  auth: {
    maxTokens: 5,
    windowMs: 60_000,     // 5 requests per 60 seconds
    label: 'authentication',
  },
  write: {
    maxTokens: 30,
    windowMs: 60_000,     // 30 writes per 60 seconds
    label: 'data operations',
  },
  read: {
    maxTokens: 60,
    windowMs: 60_000,     // 60 reads per 60 seconds
    label: 'data queries',
  },
  upload: {
    maxTokens: 10,
    windowMs: 60_000,     // 10 uploads per 60 seconds
    label: 'file uploads',
  },
};

// ─── Rate Limiter Class ──────────────────────────────────────────────────────

class RateLimiter {
  private buckets: Map<BucketName, BucketState> = new Map();

  constructor() {
    // Initialize all buckets at full capacity
    for (const [name, config] of Object.entries(BUCKET_CONFIGS)) {
      this.buckets.set(name as BucketName, {
        tokens: config.maxTokens,
        lastRefill: Date.now(),
      });
    }
  }

  /**
   * Refills tokens based on elapsed time since last refill.
   * Uses a sliding-window approach for smooth rate limiting.
   */
  private refill(bucket: BucketName): void {
    const config = BUCKET_CONFIGS[bucket];
    const state = this.buckets.get(bucket)!;
    const now = Date.now();
    const elapsed = now - state.lastRefill;

    if (elapsed >= config.windowMs) {
      // Full window has passed — reset to max
      state.tokens = config.maxTokens;
      state.lastRefill = now;
    } else {
      // Partial refill: proportional tokens based on elapsed time
      const tokensToAdd = Math.floor(
        (elapsed / config.windowMs) * config.maxTokens
      );
      if (tokensToAdd > 0) {
        state.tokens = Math.min(state.tokens + tokensToAdd, config.maxTokens);
        state.lastRefill = now;
      }
    }
  }

  /**
   * Check whether a request is allowed without consuming a token.
   */
  checkLimit(bucket: BucketName): { allowed: boolean; retryAfter: number } {
    this.refill(bucket);
    const state = this.buckets.get(bucket)!;
    const config = BUCKET_CONFIGS[bucket];

    if (state.tokens > 0) {
      return { allowed: true, retryAfter: 0 };
    }

    // Calculate when the next token will be available
    const elapsed = Date.now() - state.lastRefill;
    const retryAfter = Math.ceil((config.windowMs - elapsed) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  /**
   * Consume a token from the bucket. Throws RateLimitError if exhausted.
   */
  consume(bucket: BucketName): void {
    this.refill(bucket);
    const state = this.buckets.get(bucket)!;
    const config = BUCKET_CONFIGS[bucket];

    if (state.tokens > 0) {
      state.tokens -= 1;
      return;
    }

    // No tokens left — calculate retry time and throw
    const elapsed = Date.now() - state.lastRefill;
    const retryAfter = Math.ceil((config.windowMs - elapsed) / 1000);
    throw new RateLimitError(bucket, Math.max(retryAfter, 1), config.label);
  }

  /**
   * Returns the current status of all buckets (for debugging/UI).
   */
  getStatus(): Record<BucketName, { remaining: number; max: number }> {
    const status = {} as Record<BucketName, { remaining: number; max: number }>;
    for (const [name, config] of Object.entries(BUCKET_CONFIGS)) {
      this.refill(name as BucketName);
      const state = this.buckets.get(name as BucketName)!;
      status[name as BucketName] = {
        remaining: state.tokens,
        max: config.maxTokens,
      };
    }
    return status;
  }

  /**
   * Resets a specific bucket to full capacity.
   * Useful after a successful login to reset the auth bucket.
   */
  reset(bucket: BucketName): void {
    const config = BUCKET_CONFIGS[bucket];
    this.buckets.set(bucket, {
      tokens: config.maxTokens,
      lastRefill: Date.now(),
    });
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const rateLimiter = new RateLimiter();
