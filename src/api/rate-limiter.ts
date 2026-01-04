/**
 * Rate Limiter Utility
 *
 * Simple in-memory rate limiter for the API routes.
 * In production, use Redis or Cloudflare's built-in rate limiting.
 *
 * @module api/rate-limiter
 */

// =============================================================================
// Types
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in window */
  remaining: number;
  /** Total limit */
  limit: number;
  /** Reset timestamp */
  resetAt: Date;
  /** Retry after (seconds) if rate limited */
  retryAfter?: number;
}

// =============================================================================
// Rate Limiter Class
// =============================================================================

/**
 * In-memory rate limiter
 *
 * Note: This is for development/single-instance use only.
 * For production, use:
 * - Cloudflare Rate Limiting (https://developers.cloudflare.com/waf/rate-limiting-rules/)
 * - Redis-based rate limiting
 * - Upstash Rate Limit
 */
export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxRequests: config.maxRequests ?? 60, // 60 requests
      windowMs: config.windowMs ?? 60 * 1000 // per minute
    };

    // Cleanup expired entries every minute
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    }
  }

  /**
   * Check if a request is allowed
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.store.get(key);

    // No existing entry or window expired
    if (!entry || now > entry.resetAt) {
      const resetAt = now + this.config.windowMs;
      this.store.set(key, { count: 1, resetAt });

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        limit: this.config.maxRequests,
        resetAt: new Date(resetAt)
      };
    }

    // Within window
    if (entry.count < this.config.maxRequests) {
      entry.count++;

      return {
        allowed: true,
        remaining: this.config.maxRequests - entry.count,
        limit: this.config.maxRequests,
        resetAt: new Date(entry.resetAt)
      };
    }

    // Rate limited
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      limit: this.config.maxRequests,
      resetAt: new Date(entry.resetAt),
      retryAfter
    };
  }

  /**
   * Get rate limit headers
   */
  getHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": result.resetAt.toISOString()
    };

    if (result.retryAfter !== undefined) {
      headers["Retry-After"] = String(result.retryAfter);
    }

    return headers;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Reset a specific key (for testing)
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// =============================================================================
// Default Instance
// =============================================================================

// Chat endpoint: 30 requests per minute
export const chatRateLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 1000
});

// Tool endpoint: 60 requests per minute (lighter weight)
export const toolRateLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60 * 1000
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get client identifier for rate limiting
 * In production, use a more robust method (e.g., API key, user ID)
 */
export function getClientIdentifier(request: Request): string {
  // Try to get client IP from various headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to a default (not ideal for production)
  return "anonymous";
}

/**
 * Create rate limit error response
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: true,
      message: "Rate limit exceeded. Please slow down.",
      code: "RATE_LIMIT_EXCEEDED",
      status: 429,
      details: {
        limit: result.limit,
        resetAt: result.resetAt.toISOString(),
        retryAfter: result.retryAfter
      }
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...new RateLimiter().getHeaders(result)
      }
    }
  );
}
