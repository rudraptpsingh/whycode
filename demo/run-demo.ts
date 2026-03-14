#!/usr/bin/env tsx
/**
 * WhyCode Demo Runner
 *
 * This script demonstrates the value of WhyCode by simulating a realistic
 * codebase evolution scenario with and without decision tracking.
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const demoDbPath = join(__dirname, ".whycode-demo");

function cleanSetup() {
  console.log("🧹 Cleaning up previous demo data...\n");
  if (existsSync(demoDbPath)) {
    rmSync(demoDbPath, { recursive: true, force: true });
  }
  mkdirSync(demoDbPath, { recursive: true });
}

function runCommand(cmd: string, description: string) {
  console.log(`\n📍 ${description}`);
  console.log(`   $ ${cmd}`);
  try {
    const output = execSync(cmd, {
      cwd: projectRoot,
      encoding: "utf-8",
      env: { ...process.env, WHYCODE_DB: join(demoDbPath, "decisions.db") }
    });
    if (output.trim()) {
      console.log(`   ${output.split('\n').join('\n   ')}`);
    }
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
  }
}

function printSection(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(`  ${title}`);
  console.log("=".repeat(70));
}

function printScenario(text: string) {
  console.log(`\n💭 ${text}\n`);
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║                   WhyCode Value Demonstration                        ║
║                                                                      ║
║  Scenario: E-commerce payment service evolution over 8 weeks        ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  cleanSetup();

  // ========================================================================
  printSection("Phase 1: Initial Implementation (Week 1)");
  // ========================================================================

  printScenario(
    "Senior engineer Alice implements a payment service with Redis-based rate limiting.\n" +
    "A junior developer questions why Redis is used instead of simpler in-memory counters.\n" +
    "Alice decides to document this decision for future reference."
  );

  runCommand(
    `node dist/cli/index.js init`,
    "Initialize WhyCode in the project"
  );

  const decision1 = `
We're using Redis for rate limiting instead of in-memory counters.

Context: Payment processing service that runs on multiple instances behind a load balancer.

Decision: Use Redis-based distributed rate limiting with sliding window.

Why: In-memory rate limiting would allow users to bypass limits by hitting different server instances.
This is a security requirement for payment processing - PCI DSS compliance requires consistent
rate limiting across all entry points.

Constraints:
- MUST use distributed state (Redis) for rate limiting
- SHOULD NOT use in-memory counters for payment-related operations
- Redis must have persistence enabled for audit trail

Alternatives considered:
- In-memory rate limiting: Rejected because it doesn't work across multiple instances
- Database-based counters: Rejected due to latency requirements (need <10ms response)

Consequences: Adds Redis dependency, but it's already used for session management.

Tags: security, rate-limiting, distributed-systems, pci-compliance

File: demo/sample-codebase/payment-service.ts
Symbol: PaymentService.processPayment
`.trim();

  console.log("\n📝 Recording decision about rate limiter architecture...");
  console.log("   (In real usage, this would use: whycode capture)");
  console.log(`\n   Decision content:\n   ${decision1.split('\n').join('\n   ')}`);

  // ========================================================================
  printSection("Phase 2: Payment Retry Logic (Week 3)");
  // ========================================================================

  printScenario(
    "After a production incident where a payment gateway timeout caused cascading failures,\n" +
    "the team discovers that unbounded exponential backoff was causing request pile-ups.\n" +
    "They implement a capped retry strategy and document why these specific values were chosen."
  );

  const decision2 = `
Payment retry logic uses exponential backoff with a 2-second maximum delay cap.

Context: Payment gateway occasionally times out (5% of requests). We need retries for reliability,
but the previous unbounded exponential backoff caused thread pool exhaustion during gateway incidents.

Decision: Cap exponential backoff at 2 seconds maximum, with 3 retry attempts.

Why:
- Gateway SLA guarantees 99.9% uptime with max 5-second recovery time
- Our timeout is 3 seconds per attempt
- 2-second max delay prevents thread starvation while still providing adequate spacing
- 3 attempts gives us 99.87% success rate based on gateway statistics

Constraints:
- MUST cap backoff delay at 2 seconds (maxDelay = 2000)
- MUST limit to exactly 3 retry attempts
- AVOID changing these values without load testing

Rationale: These specific values are derived from production data analysis and load testing.
Increasing maxDelay causes thread pool exhaustion. Decreasing it causes gateway rate limiting.

Alternatives:
- Unbounded exponential backoff: Caused production incident (thread exhaustion)
- Linear backoff: Gateway rate limiting kicked in during tests
- Circuit breaker pattern: Adds complexity, gateway already has good uptime

Agent hints:
- DO NOT increase maxDelay above 2000ms
- DO NOT change retry count without consulting performance team
- IF changing retry logic, THEN must load test with 10k concurrent requests

Tags: reliability, payment-gateway, retry-logic, performance, incident-response
Type: performance
Confidence: definitive

File: demo/sample-codebase/payment-service.ts
Lines: 44-55
`.trim();

  console.log("\n📝 Recording decision about retry parameters...");
  console.log(`\n   Decision content:\n   ${decision2.split('\n').join('\n   ')}`);

  // ========================================================================
  printSection("Phase 3: Cache Invalidation Strategy (Week 5)");
  // ========================================================================

  printScenario(
    "The team adds a caching layer to reduce database load.\n" +
    "During code review, an inconsistency bug is caught where cache and database\n" +
    "could get out of sync. The fix and rationale are documented."
  );

  const decision3 = `
Payment status cache invalidation must happen within the same database transaction.

Context: Added caching layer to reduce database load for payment status queries.
Initial implementation had cache invalidation in a separate step, causing race conditions.

Decision: Cache invalidation MUST be called within the same DB transaction that updates payment status.

Why: Without transactional cache invalidation, there's a race window where:
1. Transaction commits payment status change
2. App crashes before cache invalidation
3. Stale cache serves old status for up to 60 seconds
4. User sees incorrect payment status, tries to pay again

For payment systems, even brief inconsistency violates PCI DSS requirements.

Constraints:
- MUST call cache.invalidate() before transaction commit
- MUST NOT move cache invalidation to background job
- AVOID increasing cache TTL above 60 seconds

Technical rationale: We considered using database triggers for cache invalidation,
but our ORM doesn't support them well. We also considered Redis pub/sub for
cache invalidation events, but the added complexity wasn't worth it for our scale.

Alternatives:
- Background cache invalidation: Rejected due to consistency requirements
- Database triggers: Rejected due to ORM limitations
- Redis pub/sub: Overkill for current scale (100 req/s)

Agent hints:
- IF modifying payment update logic THEN ensure cache.invalidate() is called before commit
- DO NOT separate cache invalidation from transaction boundary
- Pattern to follow: updatePayment() { tx.begin(); updateDB(); cache.invalidate(); tx.commit(); }

Tags: caching, consistency, transactions, pci-compliance
Type: architectural
Confidence: definitive
Severity: CRITICAL

File: demo/sample-codebase/payment-service.ts
Class: PaymentCache
`.trim();

  console.log("\n📝 Recording decision about cache consistency...");
  console.log(`\n   Decision content:\n   ${decision3.split('\n').join('\n   ')}`);

  // ========================================================================
  printSection("Phase 4: The Value Proposition - New Developer Arrives");
  // ========================================================================

  printScenario(
    "Week 8: Bob, a new senior engineer, joins the team and reviews the payment code.\n" +
    "He notices several 'inefficiencies' and wants to optimize..."
  );

  console.log("\n❌ WITHOUT WhyCode:\n");
  console.log("   Bob thinks:");
  console.log("   • 'Why use Redis for rate limiting? In-memory would be faster!'");
  console.log("   • 'This 2-second cap on backoff is arbitrary, let me remove it'");
  console.log("   • 'Cache invalidation in the transaction is inefficient, I'll optimize it'");
  console.log("\n   Bob makes the changes → Code review approves (looks cleaner) → Deploys");
  console.log("\n   💥 Results:");
  console.log("   • Rate limiting bypassed via load balancer (Security incident)");
  console.log("   • Thread pool exhaustion during gateway outage (P1 incident)");
  console.log("   • Payment status inconsistencies (PCI compliance violation)");
  console.log("   • 3 hours of emergency rollback and incident response");
  console.log("   • Customer trust damaged, potential regulatory fines");

  console.log("\n✅ WITH WhyCode:\n");
  console.log("   Bob queries the decision history:");

  runCommand(
    `node dist/cli/index.js list`,
    "Bob lists all documented decisions"
  );

  runCommand(
    `node dist/cli/index.js check demo/sample-codebase/payment-service.ts`,
    "Bob checks decisions related to the payment service"
  );

  console.log("\n   💡 Bob now understands:");
  console.log("   • Redis is required for distributed rate limiting (security requirement)");
  console.log("   • The 2-second cap prevents thread exhaustion (learned from incident)");
  console.log("   • Cache invalidation must be transactional (PCI compliance)");
  console.log("\n   Bob's actual improvements:");
  console.log("   • Optimizes Redis connection pooling (doesn't change the architecture)");
  console.log("   • Adds monitoring for retry rates (complements existing logic)");
  console.log("   • Improves error messages (safe change)");
  console.log("\n   ✨ Results:");
  console.log("   • No incidents");
  console.log("   • Legitimate optimizations that respect constraints");
  console.log("   • Faster onboarding (Bob understood the system in 15 minutes)");
  console.log("   • Increased team confidence in making changes");

  // ========================================================================
  printSection("Metrics Summary");
  // ========================================================================

  console.log(`
📊 Quantified Value:

Time Savings:
  • Code review time: 2 hours → 30 minutes (75% reduction)
  • Onboarding time: 3 days → 1 day (66% reduction)
  • Incident investigation: Prevented 3 hours of emergency response

Risk Reduction:
  • Prevented 3 production incidents
  • Avoided PCI compliance violation
  • Prevented potential security breach

Knowledge Preservation:
  • 3 critical decisions documented with full context
  • 0 tribal knowledge lost when Alice went on vacation
  • 100% of architectural rationale preserved

Team Efficiency:
  • Bob made confident changes on day 2
  • Alice didn't need to explain everything in person
  • Future engineers will have the same context
`);

  printSection("Try It Yourself");

  console.log(`
🚀 Interactive Demo Commands:

1. Query decisions by tag:
   $ whycode list --tag security

2. Check if a file has related decisions:
   $ whycode check demo/sample-codebase/payment-service.ts

3. Search decisions:
   $ whycode search "rate limiting"

4. Review decisions that may be stale:
   $ whycode review

5. Generate a decision heatmap:
   $ whycode heatmap

6. Use with MCP for AI agents:
   $ whycode-mcp
   (Then configure your AI agent to query decisions during code changes)

💡 The real power: Your AI coding assistant can now ask "why" before
   making changes, preventing well-intentioned but harmful refactors.
`);

  printSection("Conclusion");

  console.log(`
WhyCode transforms implicit tribal knowledge into explicit, queryable context.

Instead of learning from mistakes, your team learns from documented wisdom.
Instead of explaining the same decisions repeatedly, they're captured once.
Instead of hoping AI agents don't break things, you give them the context to succeed.

The cost: 5 minutes to document a decision.
The value: Hours saved, incidents prevented, knowledge preserved.
`);
}

main().catch(console.error);
