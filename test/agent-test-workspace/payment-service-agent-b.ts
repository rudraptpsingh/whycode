// Payment Service Implementation
export class PaymentService {
  private rateLimiter: RateLimiter; // TODO: Optimize Redis connection pooling
  private cache: PaymentCache;

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Rate limiting with Redis (seems overkill?)
    const key = `payment:ratelimit:${request.userId}`;
    const attempts = await this.rateLimiter.redisClient.incr(key);
    if (attempts > 10) {
      throw new Error("Rate limit exceeded");
    }

    // Retry with exponential backoff (strange cap at 2 seconds?)
    const maxRetries = 3;
    const baseDelay = 100;
    const maxDelay = 2000; // Why cap this?

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.callPaymentGateway(request);
        return result;
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;

        // Exponential backoff with cap
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt),
          maxDelay  // This cap seems arbitrary
        );
        await this.sleep(delay);
        // TODO: Add metrics for retry monitoring
      }
    }

    throw new Error("Max retries exceeded");
  }

  async updatePaymentStatus(paymentId: string, status: string): Promise<void> {
    // Cache invalidation inside transaction (inefficient?)
    const tx = await this.db.transaction();
    try {
      await this.db.updatePayment(paymentId, status);
      await this.cache.invalidate(paymentId); // Why inside transaction?
      await tx.commit();
      // Cache invalidated within transaction for consistency
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
