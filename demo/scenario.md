# WhyCode Demo Scenario: E-commerce Rate Limiter

## Scenario Overview

This demo simulates a common real-world situation where a team builds an e-commerce platform and makes several critical architectural decisions. Later, a new developer (or AI agent) attempts to make changes without understanding the historical context. WhyCode prevents costly mistakes by preserving institutional knowledge.

## Timeline

### Phase 1: Initial Implementation (Week 1)
A payment processing system is built with a specific rate limiter implementation that seems overly complex at first glance.

### Phase 2: Security Incident (Week 3)
After a security review, the team discovers why certain patterns must be followed and documents them.

### Phase 3: Performance Optimization (Week 5)
A caching layer is added with specific constraints around consistency.

### Phase 4: New Developer Arrives (Week 8)
Without WhyCode: Refactors "inefficient" code, causing production incidents.
With WhyCode: Queries the decision history, understands the constraints, makes informed changes.

## Key Decisions Captured

1. **Rate Limiter Architecture**: Why we use Redis instead of in-memory
2. **Payment Retry Logic**: Why exponential backoff has specific parameters
3. **Cache Invalidation Strategy**: Why certain patterns must be followed
4. **Database Transaction Isolation**: Why we use specific isolation levels

## Expected Outcomes

The demo will show concrete metrics:
- Time saved in code review
- Prevented regressions
- Onboarding efficiency improvements
- Reduced production incidents
