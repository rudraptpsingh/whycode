#!/usr/bin/env node
/**
 * WhyCode Demo Runner (Scripted - No Interactive Prompts)
 *
 * This script demonstrates the value of WhyCode by simulating a realistic
 * codebase evolution scenario with actual database operations.
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { initDb } from "../dist/db/schema.js";
import { insertDecision, getDecisionsByPath, getAllDecisions } from "../dist/db/decisions.js";
import type { WhyCodeRecord } from "../dist/types/index.js";

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

  // Initialize database
  initDb(demoDbPath);
  const dbPath = join(demoDbPath, "decisions.db");
  const db = new Database(dbPath);

  // Write config
  writeFileSync(
    join(demoDbPath, "config.json"),
    JSON.stringify({
      version: "1.0.0",
      author: "Alice (Senior Engineer)",
      repoRoot: projectRoot,
      createdAt: new Date().toISOString(),
    }, null, 2)
  );

  // ========================================================================
  printSection("Phase 1: Initial Implementation (Week 1)");
  // ========================================================================

  printScenario(
    "Senior engineer Alice implements a payment service with Redis-based rate limiting.\n" +
    "A junior developer questions why Redis is used instead of simpler in-memory counters.\n" +
    "Alice decides to document this decision for future reference."
  );

  console.log("✅ WhyCode initialized in demo environment\n");

  const decision1: WhyCodeRecord = {
    id: uuidv4(),
    version: 1,
    status: "active",
    title: "Redis-Based Distributed Rate Limiting for Payment Service",
    summary: "Use Redis for rate limiting instead of in-memory counters to ensure consistent rate limiting across multiple server instances.",
    context: "Payment processing service runs on multiple instances behind a load balancer. PCI DSS compliance requires consistent rate limiting across all entry points.",
    decision: "Implement Redis-based distributed rate limiting with sliding window algorithm for all payment-related operations.",
    rationale: "In-memory rate limiting would allow users to bypass limits by hitting different server instances. This creates a security vulnerability and violates PCI DSS compliance requirements for payment processing systems.",
    constraints: [
      {
        description: "MUST use distributed state (Redis) for rate limiting",
        severity: "must",
        rationale: "Security requirement for multi-instance deployments"
      },
      {
        description: "SHOULD NOT use in-memory counters for payment-related operations",
        severity: "avoid",
        rationale: "Creates security bypass opportunity via load balancer"
      },
      {
        description: "Redis must have persistence enabled for audit trail",
        severity: "must",
        rationale: "Compliance and forensics requirements"
      }
    ],
    alternatives: [
      {
        description: "In-memory rate limiting using local counters",
        rejectionReason: "Doesn't work across multiple instances - users can bypass by hitting different servers",
        tradeoffs: "Simpler implementation but creates security vulnerability"
      },
      {
        description: "Database-based counters with row-level locking",
        rejectionReason: "Latency requirements not met (need <10ms response time)",
        tradeoffs: "More consistent than in-memory but too slow for real-time rate limiting"
      }
    ],
    consequences: "Adds Redis as a dependency, but it's already used for session management so no additional infrastructure needed.",
    tags: ["security", "rate-limiting", "distributed-systems", "pci-compliance", "redis"],
    decisionType: "security",
    confidence: "definitive",
    author: "Alice (Senior Engineer)",
    timestamp: new Date(Date.now() - 7 * 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 weeks ago
    anchors: [
      {
        type: "file",
        path: "demo/sample-codebase/payment-service.ts"
      },
      {
        type: "function",
        path: "demo/sample-codebase/payment-service.ts",
        identifier: "PaymentService.processPayment"
      }
    ],
    agentHints: [
      {
        instruction: "DO NOT replace Redis rate limiting with in-memory counters",
        scope: "function"
      },
      {
        instruction: "IF modifying rate limiting logic THEN ensure it works across distributed instances",
        scope: "function"
      }
    ],
    doNotChange: ["rateLimiter.redisClient"],
    reviewTriggers: ["rate limit", "payment throttle", "request limit"],
    supersedes: []
  };

  insertDecision(db, decision1);
  console.log("📝 Decision recorded: Redis-Based Rate Limiting");
  console.log(`   ID: ${decision1.id}`);
  console.log(`   Tags: ${decision1.tags.join(", ")}`);
  console.log(`   Anchors: ${decision1.anchors.length} code locations\n`);

  // ========================================================================
  printSection("Phase 2: Payment Retry Logic (Week 3)");
  // ========================================================================

  printScenario(
    "After a production incident where a payment gateway timeout caused cascading failures,\n" +
    "the team discovers that unbounded exponential backoff was causing request pile-ups.\n" +
    "They implement a capped retry strategy and document why these specific values were chosen."
  );

  const decision2: WhyCodeRecord = {
    id: uuidv4(),
    version: 1,
    status: "active",
    title: "Capped Exponential Backoff for Payment Gateway Retries",
    summary: "Payment retry logic uses exponential backoff with a strict 2-second maximum delay cap and exactly 3 retry attempts.",
    context: "Payment gateway occasionally times out (5% of requests under load). Previous implementation used unbounded exponential backoff which caused thread pool exhaustion during a gateway incident, leading to a P1 production outage.",
    decision: "Implement exponential backoff capped at 2 seconds maximum (maxDelay = 2000ms) with exactly 3 retry attempts (maxRetries = 3).",
    rationale: "These specific values are derived from production data analysis and load testing:\n- Gateway SLA: 99.9% uptime with max 5-second recovery time\n- Per-attempt timeout: 3 seconds\n- 2-second max delay prevents thread starvation while providing adequate request spacing\n- 3 attempts achieves 99.87% success rate based on gateway failure statistics\n\nIncreasing maxDelay causes thread pool exhaustion (proven in incident). Decreasing it triggers gateway rate limiting (proven in load tests).",
    constraints: [
      {
        description: "MUST cap backoff delay at exactly 2 seconds (maxDelay = 2000)",
        severity: "must",
        rationale: "Values >2000ms cause thread pool exhaustion under load"
      },
      {
        description: "MUST limit to exactly 3 retry attempts",
        severity: "must",
        rationale: "More retries cause cascading delays, fewer reduce success rate below SLA"
      },
      {
        description: "AVOID changing these values without comprehensive load testing",
        severity: "avoid",
        rationale: "These values are finely tuned based on production incident analysis"
      }
    ],
    alternatives: [
      {
        description: "Unbounded exponential backoff (previous implementation)",
        rejectionReason: "Caused production incident - thread pool exhaustion during gateway outage",
        tradeoffs: "Simpler logic but catastrophic failure mode"
      },
      {
        description: "Linear backoff with constant delays",
        rejectionReason: "Gateway rate limiting kicked in during load tests",
        tradeoffs: "More predictable but triggers gateway protections"
      },
      {
        description: "Circuit breaker pattern",
        rejectionReason: "Adds significant complexity, gateway already has good uptime (99.9%)",
        tradeoffs: "Better for unreliable services but overkill for our gateway SLA"
      }
    ],
    consequences: "Retry logic is more complex but prevents cascading failures. Success rate of 99.87% exceeds our 99.5% SLA. Thread pool remains stable under gateway outages.",
    tags: ["reliability", "payment-gateway", "retry-logic", "performance", "incident-response"],
    decisionType: "performance",
    confidence: "definitive",
    author: "Alice & SRE Team",
    timestamp: new Date(Date.now() - 5 * 7 * 24 * 60 * 60 * 1000).toISOString(), // 5 weeks ago
    linkedIssue: "INC-2849",
    anchors: [
      {
        type: "line-range",
        path: "demo/sample-codebase/payment-service.ts",
        lineRange: [37, 55]
      }
    ],
    agentHints: [
      {
        instruction: "DO NOT increase maxDelay above 2000ms - this causes thread pool exhaustion",
        scope: "function"
      },
      {
        instruction: "DO NOT change retry count without consulting performance team and running load tests",
        scope: "function"
      },
      {
        instruction: "IF changing retry logic THEN must load test with 10k concurrent requests simulating gateway timeout",
        scope: "function"
      }
    ],
    doNotChange: ["maxDelay", "maxRetries"],
    reviewTriggers: ["retry", "backoff", "payment gateway", "timeout"],
    supersedes: []
  };

  insertDecision(db, decision2);
  console.log("📝 Decision recorded: Capped Exponential Backoff");
  console.log(`   ID: ${decision2.id}`);
  console.log(`   Linked to incident: INC-2849`);
  console.log(`   Critical constraints: ${decision2.constraints.length}\n`);

  // ========================================================================
  printSection("Phase 3: Cache Invalidation Strategy (Week 5)");
  // ========================================================================

  printScenario(
    "The team adds a caching layer to reduce database load.\n" +
    "During code review, an inconsistency bug is caught where cache and database\n" +
    "could get out of sync. The fix and rationale are documented."
  );

  const decision3: WhyCodeRecord = {
    id: uuidv4(),
    version: 1,
    status: "active",
    title: "Transactional Cache Invalidation for Payment Status",
    summary: "Payment status cache invalidation MUST occur within the same database transaction that updates payment status to prevent consistency violations.",
    context: "Added caching layer to reduce database load for payment status queries (from 5000 QPS to 500 QPS). Initial implementation had cache invalidation in a separate step after transaction commit, creating a race condition window.",
    decision: "Cache invalidation MUST be called within the same database transaction that updates payment status, before transaction commit.",
    rationale: "Without transactional cache invalidation, there's a critical race window:\n1. Transaction commits payment status change to database\n2. Application crashes or connection drops before cache invalidation\n3. Stale cache serves old payment status for up to 60 seconds (TTL)\n4. User sees incorrect 'pending' status, attempts duplicate payment\n5. Duplicate charge occurs, customer complaint, refund required\n\nFor payment systems, even brief (1-60 second) inconsistency violates PCI DSS requirements and creates financial liability. This was caught in code review before production.",
    constraints: [
      {
        description: "MUST call cache.invalidate() before database transaction commit",
        severity: "must",
        rationale: "Ensures cache is never inconsistent with database state"
      },
      {
        description: "MUST NOT move cache invalidation to background job or async process",
        severity: "must",
        rationale: "Creates race condition and consistency violation"
      },
      {
        description: "AVOID increasing cache TTL above 60 seconds",
        severity: "should",
        rationale: "Longer TTL increases impact window of any consistency bugs"
      }
    ],
    alternatives: [
      {
        description: "Background cache invalidation via job queue",
        rejectionReason: "Creates eventual consistency with unacceptable inconsistency window for payment data",
        tradeoffs: "Better performance but violates consistency requirements"
      },
      {
        description: "Database triggers for cache invalidation",
        rejectionReason: "Our ORM (TypeORM) doesn't support triggers well, would require raw SQL maintenance",
        tradeoffs: "More reliable but breaks ORM abstractions and harder to test"
      },
      {
        description: "Redis pub/sub for cache invalidation events",
        rejectionReason: "Overkill for current scale (100 req/s), adds significant complexity",
        tradeoffs: "More sophisticated but not needed until we scale 10x"
      }
    ],
    consequences: "Slight performance overhead from synchronous cache invalidation (~5ms per payment update), but ensures consistency. Cache still provides 90% reduction in database load for read operations.",
    tags: ["caching", "consistency", "transactions", "pci-compliance", "data-integrity"],
    decisionType: "architectural",
    confidence: "definitive",
    author: "Alice & Code Review Team",
    timestamp: new Date(Date.now() - 3 * 7 * 24 * 60 * 60 * 1000).toISOString(), // 3 weeks ago
    anchors: [
      {
        type: "class",
        path: "demo/sample-codebase/payment-service.ts",
        identifier: "PaymentCache"
      },
      {
        type: "function",
        path: "demo/sample-codebase/payment-service.ts",
        identifier: "PaymentCache.invalidate"
      }
    ],
    agentHints: [
      {
        instruction: "IF modifying payment update logic THEN ensure cache.invalidate() is called before transaction commit",
        scope: "function"
      },
      {
        instruction: "DO NOT separate cache invalidation from transaction boundary",
        scope: "pattern"
      },
      {
        instruction: "PATTERN to follow: updatePayment() { tx.begin(); updateDB(); cache.invalidate(); tx.commit(); }",
        scope: "pattern"
      }
    ],
    doNotChange: ["cache invalidation order"],
    reviewTriggers: ["cache", "payment update", "transaction", "invalidate"],
    supersedes: []
  };

  insertDecision(db, decision3);
  console.log("📝 Decision recorded: Transactional Cache Invalidation");
  console.log(`   ID: ${decision3.id}`);
  console.log(`   Severity: CRITICAL - data consistency requirement\n`);

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

  console.log("\n\n✅ WITH WhyCode:\n");
  console.log("   Bob queries the decision history:");

  console.log("\n   1️⃣  Bob checks decisions for the payment service file:\n");
  const decisionsForFile = getDecisionsByPath(db, "demo/sample-codebase/payment-service.ts");
  console.log(`   Found ${decisionsForFile.length} decisions related to this file:\n`);
  decisionsForFile.forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.title}`);
    console.log(`      Type: ${d.decisionType} | Confidence: ${d.confidence}`);
    console.log(`      Tags: ${d.tags.join(", ")}`);
    console.log(`      Key constraint: ${d.constraints[0]?.description || "N/A"}`);
    console.log(`      Agent hint: ${d.agentHints[0]?.instruction || "N/A"}`);
    console.log();
  });

  console.log("\n   2️⃣  Bob lists all decisions to understand the architecture:\n");
  const allDecisions = getAllDecisions(db);
  console.log(`   Total decisions documented: ${allDecisions.length}\n`);
  allDecisions.forEach((d, i) => {
    const age = Math.floor((Date.now() - new Date(d.timestamp).getTime()) / (7 * 24 * 60 * 60 * 1000));
    console.log(`   ${i + 1}. ${d.title}`);
    console.log(`      Author: ${d.author} | ${age} weeks ago`);
    console.log(`      Summary: ${d.summary.substring(0, 80)}...`);
    console.log();
  });

  console.log("\n   💡 Bob now understands:");
  console.log("   • Redis is required for distributed rate limiting (security requirement)");
  console.log("   • The 2-second cap prevents thread exhaustion (learned from actual incident)");
  console.log("   • Cache invalidation must be transactional (PCI compliance + data integrity)");
  console.log("   • Each decision has specific rationale backed by testing or incidents");
  console.log("\n   Bob's actual improvements:");
  console.log("   • Optimizes Redis connection pooling (doesn't change the architecture) ✓");
  console.log("   • Adds monitoring for retry rates (complements existing logic) ✓");
  console.log("   • Improves error messages (safe change) ✓");
  console.log("   • Documents his changes too (continues the practice) ✓");
  console.log("\n   ✨ Results:");
  console.log("   • Zero incidents");
  console.log("   • Legitimate optimizations that respect constraints");
  console.log("   • Faster onboarding (Bob understood the system in 15 minutes vs 3 days)");
  console.log("   • Increased team confidence in making changes");
  console.log("   • Bob becomes a WhyCode advocate");

  // ========================================================================
  printSection("Metrics Summary");
  // ========================================================================

  console.log(`
📊 Quantified Value:

Time Savings:
  • Code review time: 2 hours → 30 minutes (75% reduction)
    Rationale: Reviewers can reference decisions instead of re-explaining

  • Onboarding time: 3 days → 1 day (66% reduction)
    Rationale: New engineers read decision history instead of tribal knowledge transfer

  • Incident investigation: Prevented 3 hours of emergency response
    Rationale: Would have required rollback, postmortem, and customer communication

Risk Reduction:
  • Prevented 3 production incidents (security, performance, consistency)
  • Avoided PCI compliance violation (potential $10k-$100k fine)
  • Prevented security breach via rate limit bypass
  • Protected customer trust and brand reputation

Knowledge Preservation:
  • 3 critical decisions documented with full context
  • 0 tribal knowledge lost when Alice went on vacation
  • 100% of architectural rationale preserved
  • Future engineers will have the same context

Team Efficiency:
  • Bob made confident changes on day 2 (vs week 2 without context)
  • Alice didn't need to explain everything in person (saved 5 hours)
  • Code review faster and more thorough
  • Technical debt prevented before it's created

AI Agent Benefits:
  • AI coding assistants can query decisions before making changes
  • Prevents well-intentioned but harmful "optimizations"
  • AI can learn from human decisions and constraints
  • Reduces hallucination impact by grounding AI in project history
`);

  printSection("Decision Quality Metrics");

  console.log(`
📈 Decision Documentation Quality:

Decision 1: Redis Rate Limiting
  ✓ Clear rationale backed by security requirements
  ✓ Multiple alternatives considered with rejection reasons
  ✓ Specific constraints with severity levels
  ✓ Agent hints for future modifications
  ✓ Tags for discoverability

Decision 2: Retry Logic
  ✓ Linked to actual production incident (INC-2849)
  ✓ Specific values derived from load testing
  ✓ Clear consequences of violating constraints
  ✓ Multiple alternatives tested and rejected
  ✓ Definitive confidence level (production-proven)

Decision 3: Cache Consistency
  ✓ Explains race condition with step-by-step scenario
  ✓ Compliance requirements (PCI DSS) documented
  ✓ Pattern-level guidance for similar situations
  ✓ Performance tradeoffs quantified
  ✓ Critical severity marked

Average decision quality score: 9.5/10
(Based on: completeness, specificity, actionability, context)
`);

  printSection("Try It Yourself");

  console.log(`
🚀 Interactive Demo Commands:

The demo has created a working WhyCode database with real decisions.
Try these commands:

1. List all decisions:
   $ WHYCODE_DB="${demoDbPath}/decisions.db" node dist/cli/index.js list

2. Check decisions for the payment service:
   $ WHYCODE_DB="${demoDbPath}/decisions.db" node dist/cli/index.js check demo/sample-codebase/payment-service.ts

3. Search for specific topics:
   $ WHYCODE_DB="${demoDbPath}/decisions.db" node dist/cli/index.js search "rate limiting"
   $ WHYCODE_DB="${demoDbPath}/decisions.db" node dist/cli/index.js search "retry"

4. Filter by tags:
   $ WHYCODE_DB="${demoDbPath}/decisions.db" node dist/cli/index.js list --tag security
   $ WHYCODE_DB="${demoDbPath}/decisions.db" node dist/cli/index.js list --tag performance

5. View metrics:
   $ WHYCODE_DB="${demoDbPath}/decisions.db" node dist/cli/index.js metrics

💡 The real power: Configure your AI coding assistant (via MCP) to
   automatically query these decisions before making changes.
`);

  printSection("Conclusion");

  console.log(`
WhyCode transforms implicit tribal knowledge into explicit, queryable context.

The Traditional Approach:
  → Senior engineers explain decisions verbally (repeatedly)
  → Context gets lost when people leave or forget
  → New engineers learn by making mistakes
  → AI agents make "improvements" that break subtle constraints
  → Code reviews focus on re-explaining old decisions

The WhyCode Approach:
  → Decisions documented once, referenced forever
  → Context preserved in a structured, searchable format
  → New engineers (and AI) learn from documented wisdom
  → Changes respect historical constraints
  → Code reviews focus on new logic, not re-explaining history

Cost vs Value:
  • Time to document: ~5-10 minutes per decision
  • Time saved: Hours per developer per month
  • Incidents prevented: Priceless
  • Knowledge preserved: Permanent

ROI Calculation (for this scenario):
  • 3 decisions × 10 minutes = 30 minutes invested
  • Prevented incidents = 3 hours emergency response
  • Faster onboarding = 2 days per engineer
  • Better code reviews = 1.5 hours per review cycle

  Return: ~20x time investment in first month alone

🎯 WhyCode isn't just documentation—it's institutional memory that works.
`);

  db.close();

  console.log(`\n📁 Demo database created at: ${demoDbPath}/decisions.db`);
  console.log(`   Use WHYCODE_DB environment variable to interact with it.\n`);
}

main().catch(console.error);
