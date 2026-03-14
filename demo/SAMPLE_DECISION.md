# Sample WhyCode Decision Record

This is an example of what a fully-documented WhyCode decision looks like.

---

## Decision: Capped Exponential Backoff for Payment Gateway Retries

**ID**: `4217dd44-00aa-4297-b675-59f244ad3fd0`
**Status**: Active
**Type**: Performance
**Confidence**: Definitive
**Author**: Alice & SRE Team
**Date**: 5 weeks ago
**Linked Incident**: INC-2849

---

### Summary

Payment retry logic uses exponential backoff with a strict 2-second maximum delay cap and exactly 3 retry attempts.

---

### Context

Payment gateway occasionally times out (5% of requests under load). Previous implementation used unbounded exponential backoff which caused thread pool exhaustion during a gateway incident, leading to a P1 production outage.

The incident happened during a brief gateway slowdown where response times increased from 500ms to 3 seconds. Our retry logic started backing off exponentially without limits:
- Attempt 1: 100ms delay
- Attempt 2: 200ms delay
- Attempt 3: 400ms delay
- Attempt 4: 800ms delay
- Attempt 5: 1600ms delay
- Attempt 6: 3200ms delay
- ...and so on

Within 5 minutes, we had thousands of threads waiting with delays of 10+ seconds, causing complete thread pool exhaustion.

---

### Decision

Implement exponential backoff capped at 2 seconds maximum (maxDelay = 2000ms) with exactly 3 retry attempts (maxRetries = 3).

```typescript
const maxRetries = 3;
const baseDelay = 100; // ms
const maxDelay = 2000; // ms - capped at 2 seconds

for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    const result = await this.callPaymentGateway(request);
    return result;
  } catch (error) {
    if (attempt === maxRetries - 1) throw error;

    // Exponential backoff with jitter, but CAPPED at maxDelay
    const delay = Math.min(
      baseDelay * Math.pow(2, attempt) + Math.random() * 100,
      maxDelay  // THIS CAP IS CRITICAL
    );
    await this.sleep(delay);
  }
}
```

---

### Rationale

These specific values are derived from production data analysis and load testing:

**Gateway SLA & Characteristics:**
- 99.9% uptime with max 5-second recovery time
- Typical timeout rate: 0.1% (1 in 1000 requests)
- Under load timeout rate: 5% (50 in 1000 requests)
- Recovery pattern: Returns to normal within 5 seconds

**Our System Constraints:**
- Per-attempt timeout: 3 seconds
- Thread pool size: 200 threads
- Target throughput: 1000 req/s
- Max acceptable latency: 10 seconds for payment operations

**Why 2000ms cap:**
- Values > 2000ms cause thread pool exhaustion under load (proven in incident)
- Values < 2000ms trigger gateway rate limiting (proven in load tests)
- 2000ms provides adequate spacing without resource exhaustion

**Why 3 attempts:**
- Success rate with 3 attempts: 99.87% (based on gateway statistics)
- Success rate with 2 attempts: 99.5% (below our SLA)
- Success rate with 4 attempts: 99.95% (but increased latency not worth 0.08% gain)
- More retries cause cascading delays during incidents

**Math:**
- Worst case timing: 3s + 2s + 3s + 2s + 3s = 13 seconds total
- Average case timing: 3s (no retries needed 99% of time)
- Under load timing: 3s + 1s + 3s = 7 seconds (acceptable)

---

### Constraints

#### MUST: Cap backoff delay at exactly 2 seconds (maxDelay = 2000)
**Severity**: MUST
**Rationale**: Values > 2000ms cause thread pool exhaustion under load. This was proven during incident INC-2849 where 5-second delays caused complete service failure.

#### MUST: Limit to exactly 3 retry attempts
**Severity**: MUST
**Rationale**: More retries cause cascading delays. Fewer retries reduce success rate below SLA (99.5%). The value of 3 is mathematically optimal given our gateway statistics.

#### AVOID: Changing these values without comprehensive load testing
**Severity**: AVOID
**Rationale**: These values are finely tuned based on production incident analysis and extensive load testing. Any changes require validation with 10k+ concurrent requests simulating gateway timeout scenarios.

---

### Alternatives Considered

#### 1. Unbounded Exponential Backoff (Previous Implementation)
**Rejected**: Caused production incident INC-2849

**What happened**: During a gateway slowdown, delays grew unbounded (10s, 20s, 40s...), causing thread pool exhaustion and complete service failure.

**Tradeoffs**: Simpler logic (just `Math.pow(2, attempt)`) but catastrophic failure mode during incidents.

**Why rejected**: Proven unsafe in production.

#### 2. Linear Backoff with Constant Delays
**Rejected**: Gateway rate limiting kicked in during load tests

**What happened**: Used constant 500ms delays. Gateway saw this as "burst retry pattern" and activated rate limiting, making success rate worse.

**Tradeoffs**: More predictable, but triggers gateway protections and reduces success rate to 95%.

**Why rejected**: Doesn't meet our 99.5% SLA.

#### 3. Circuit Breaker Pattern
**Rejected**: Adds significant complexity, gateway already has good uptime (99.9%)

**What happened**: Implemented and tested but found it prevented legitimate retries. Gateway incidents are brief (< 5 seconds) so circuit breaker stayed closed.

**Tradeoffs**: Better for unreliable services (90% uptime), but overkill for our gateway's 99.9% SLA. Added 200 lines of code and new failure modes.

**Why rejected**: Complexity not justified given gateway reliability.

---

### Consequences

**Positive:**
- Success rate of 99.87% exceeds our 99.5% SLA
- Thread pool remains stable under gateway outages (proven in testing)
- No cascading failures during gateway incidents
- Predictable worst-case latency (13 seconds)

**Negative:**
- Retry logic is more complex than simple exponential backoff
- Requires careful maintenance of magic numbers (2000, 3)
- Cannot be "simplified" without understanding the rationale

**Performance Impact:**
- 99% of requests: No retries, no overhead
- 1% of requests: Average 1 retry, 4 seconds total
- During incidents: Average 2 retries, 7 seconds total

---

### Agent Hints

#### For AI Coding Assistants:

**Hint 1**:
DO NOT increase maxDelay above 2000ms - this causes thread pool exhaustion
**Scope**: Function

**Hint 2**:
DO NOT change retry count without consulting performance team and running load tests
**Scope**: Function

**Hint 3**:
IF changing retry logic THEN must load test with 10k concurrent requests simulating gateway timeout
**Scope**: Function

---

### Do Not Change

These specific code elements are intentionally designed and must not be modified:
- `maxDelay` constant (2000)
- `maxRetries` constant (3)

---

### Review Triggers

This decision should be reviewed when code changes involve:
- "retry"
- "backoff"
- "payment gateway"
- "timeout"

---

### Code Anchors

This decision applies to:
- **File**: `demo/sample-codebase/payment-service.ts`
- **Lines**: 37-55
- **Function**: `PaymentService.processPayment`

---

### Tags

`reliability`, `payment-gateway`, `retry-logic`, `performance`, `incident-response`

---

## What Makes This a Quality Decision?

### ✅ Completeness
- Full context including the incident that drove it
- Mathematical reasoning for specific values
- Multiple alternatives with detailed rejection reasons
- Quantified impacts and tradeoffs

### ✅ Specificity
- Exact values with rationale (2000ms, 3 attempts)
- Linked to real incident (INC-2849)
- Quantified success rates (99.87%)
- Specific constraints with severity levels

### ✅ Actionability
- Clear "do not change" elements
- Agent hints for AI assistants
- Review triggers for relevant changes
- Exact code locations

### ✅ Context
- Production incident history
- Load testing results
- Gateway SLA details
- System constraints

### ✅ Future-Proof
- Explains why alternatives were rejected
- Documents what was tested and learned
- Provides guidance for future modifications
- Links to incident for deeper context

---

## How This Prevents Incidents

### Without This Documentation:
1. New engineer sees `Math.min(..., maxDelay)` and thinks "unnecessary complexity"
2. Removes the cap for "cleaner" code
3. Code review approves (looks simpler!)
4. Next gateway incident → thread pool exhaustion → P1 outage
5. 3 hours of emergency response
6. Re-learns the lesson the hard way

### With This Documentation:
1. New engineer runs `whycode check payment-service.ts`
2. Reads this decision
3. Understands the cap prevents thread exhaustion
4. Makes a different optimization that respects the constraint
5. No incident
6. 3 hours saved

**That's the WhyCode difference.**

---

## Version History

- **v1** (5 weeks ago): Initial decision after incident INC-2849
- Current version: 1
- Status: Active
- Supersedes: None
- Superseded by: None

---

*This decision record demonstrates the level of detail that makes WhyCode effective. It's not just "we use retries"—it's the complete story of why, backed by data, incidents, and tested alternatives.*
