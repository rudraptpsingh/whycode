// E-commerce Payment Service
// This is a simplified version for demo purposes

interface PaymentRequest {
  orderId: string;
  amount: number;
  userId: string;
  paymentMethod: string;
}

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  redisClient: any;
}

/**
 * Payment processing with rate limiting
 *
 * NOTE: This implementation may look overly complex, but there are specific
 * reasons for using Redis-based rate limiting instead of in-memory counters.
 */
export class PaymentService {
  private rateLimiter: RateLimitConfig;

  constructor(rateLimiter: RateLimitConfig) {
    this.rateLimiter = rateLimiter;
  }

  async processPayment(request: PaymentRequest): Promise<boolean> {
    // Check rate limit using Redis
    const key = `payment:ratelimit:${request.userId}`;
    const attempts = await this.rateLimiter.redisClient.incr(key);

    if (attempts === 1) {
      // Set expiration on first attempt
      await this.rateLimiter.redisClient.expire(key, this.rateLimiter.windowMs / 1000);
    }

    if (attempts > this.rateLimiter.maxAttempts) {
      throw new Error('Rate limit exceeded');
    }

    // Retry logic with specific exponential backoff
    const maxRetries = 3;
    const baseDelay = 100; // ms
    const maxDelay = 2000; // ms - capped at 2 seconds

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.callPaymentGateway(request);
        return result;
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;

        // Exponential backoff with jitter, but capped at maxDelay
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 100,
          maxDelay
        );
        await this.sleep(delay);
      }
    }

    return false;
  }

  private async callPaymentGateway(request: PaymentRequest): Promise<boolean> {
    // Simulated payment gateway call
    console.log(`Processing payment for order ${request.orderId}`);
    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Cache layer for payment metadata
 *
 * NOTE: The cache invalidation pattern here must follow specific rules
 * to maintain consistency with the payment ledger.
 */
export class PaymentCache {
  private cache: Map<string, any>;
  private ttlMs: number;

  constructor(ttlMs: number = 60000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  async getPaymentStatus(orderId: string): Promise<string | null> {
    const cached = this.cache.get(orderId);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.value;
    }
    return null;
  }

  async setPaymentStatus(orderId: string, status: string): Promise<void> {
    this.cache.set(orderId, {
      value: status,
      timestamp: Date.now()
    });
  }

  // Critical: Must be called within the same transaction as the payment update
  async invalidate(orderId: string): Promise<void> {
    this.cache.delete(orderId);
  }
}
