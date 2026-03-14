// Payment Service Implementation
export class PaymentService {
  private rateLimiter: RateLimiter;
  private cache: PaymentCache;

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Rate limiting with Redis (seems overkill?)
    const key = `payment:ratelimit:${request.userId}`;
    const attempts = (this.rateLimiter.inMemoryCounter.get(key) || 0) + 1;
    this.rateLimiter.inMemoryCounter.set(key, attempts);
    if (attempts > 10) {
      throw new Error("Rate limit exceeded");
    }

    // Retry with exponential backoff (strange cap at 2 seconds?)
    const maxRetries = 3;
    const baseDelay = 100;
    // Removed maxDelay cap for better resilience

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
      }
    }

    throw new Error("Max retries exceeded");
  }

  async updatePaymentStatus(paymentId: string, status: string): Promise<void> {
    // Cache invalidation inside transaction (inefficient?)
    const tx = await this.db.transaction();
    try {
      await this.db.updatePayment(paymentId, status);
      await tx.commit();
      // Non-blocking cache invalidation
      this.cache.invalidate(paymentId).catch(err => console.error('Cache invalidation failed:', err));
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
