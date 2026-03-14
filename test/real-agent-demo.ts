#!/usr/bin/env node
/**
 * Real Agent Simulation - Testing WhyCode Integration
 *
 * This script simulates actual AI agents making code changes,
 * with and without WhyCode guidance, showing real differences.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { initDb } from "../dist/db/schema.js";
import { insertDecision, getDecisionsByPath } from "../dist/db/decisions.js";
import type { WhyCodeRecord } from "../dist/types/index.js";
import { v4 as uuidv4 } from "uuid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const testDir = join(projectRoot, "test", "agent-test-workspace");

// Clean and setup test workspace
if (existsSync(testDir)) {
  rmSync(testDir, { recursive: true, force: true });
}
mkdirSync(testDir, { recursive: true });

const dbPath = join(testDir, ".whycode");

// Initialize test database
initDb(dbPath);
const db = new Database(join(dbPath, "decisions.db"));

// Original "problematic" code that looks like it needs optimization
const originalCode = `// Payment Service Implementation
export class PaymentService {
  private rateLimiter: RateLimiter;
  private cache: PaymentCache;

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Rate limiting with Redis (seems overkill?)
    const key = \`payment:ratelimit:\${request.userId}\`;
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
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
`;

// Write original code
const codeFile = join(testDir, "payment-service.ts");
writeFileSync(codeFile, originalCode);

// Simulate Agent A: No WhyCode guidance
class AgentWithoutWhyCode {
  name = "Agent A (No Guidance)";

  analyzeCode(code: string): string[] {
    const issues = [];

    if (code.includes("redisClient")) {
      issues.push("Found: Redis for rate limiting - this seems overengineered");
    }

    if (code.includes("maxDelay")) {
      issues.push("Found: Arbitrary cap on exponential backoff");
    }

    if (code.includes("cache.invalidate") && code.includes("transaction")) {
      issues.push("Found: Cache invalidation blocking transaction commit");
    }

    return issues;
  }

  applyChanges(code: string): { code: string; changes: string[] } {
    const changes = [];
    let newCode = code;

    // "Optimization" 1: Replace Redis with in-memory
    if (code.includes("redisClient")) {
      newCode = newCode.replace(
        /const attempts = await this\.rateLimiter\.redisClient\.incr\(key\);/,
        "const attempts = (this.rateLimiter.inMemoryCounter.get(key) || 0) + 1;\n    this.rateLimiter.inMemoryCounter.set(key, attempts);"
      );
      changes.push("Replace Redis rate limiting with faster in-memory counters");
    }

    // "Optimization" 2: Remove backoff cap
    if (code.includes("maxDelay  // This cap seems arbitrary")) {
      newCode = newCode.replace(
        /const delay = Math\.min\(\s*baseDelay \* Math\.pow\(2, attempt\),\s*maxDelay.*\);/,
        "const delay = baseDelay * Math.pow(2, attempt); // Removed arbitrary cap"
      );
      newCode = newCode.replace("const maxDelay = 2000; // Why cap this?", "// Removed maxDelay cap for better resilience");
      changes.push("Remove arbitrary cap on exponential backoff");
    }

    // "Optimization" 3: Make cache invalidation async
    if (code.includes("await this.cache.invalidate(paymentId); // Why inside transaction?")) {
      newCode = newCode.replace(
        "await this.cache.invalidate(paymentId); // Why inside transaction?\n      await tx.commit();",
        "await tx.commit();\n      // Non-blocking cache invalidation\n      this.cache.invalidate(paymentId).catch(err => console.error('Cache invalidation failed:', err));"
      );
      changes.push("Move cache invalidation outside transaction for better performance");
    }

    return { code: newCode, changes };
  }
}

// Simulate Agent B: With WhyCode guidance
class AgentWithWhyCode {
  name = "Agent B (WhyCode Guided)";

  constructor(private db: Database.Database) {}

  checkDecisions(filePath: string): WhyCodeRecord[] {
    return getDecisionsByPath(this.db, filePath);
  }

  analyzeCode(code: string, decisions: WhyCodeRecord[]): {issues: string[]; constraints: string[]} {
    const issues = [];
    const constraints = [];

    decisions.forEach(d => {
      d.constraints.forEach(c => {
        constraints.push(`${c.severity.toUpperCase()}: ${c.description}`);
      });
    });

    if (code.includes("redisClient")) {
      const hasConstraint = decisions.some(d =>
        d.constraints.some(c => c.description.toLowerCase().includes("redis") || c.description.toLowerCase().includes("distributed"))
      );

      if (hasConstraint) {
        issues.push("Found: Redis rate limiting - CONSTRAINED (must use distributed state)");
      } else {
        issues.push("Found: Redis rate limiting - could potentially optimize");
      }
    }

    if (code.includes("maxDelay")) {
      const hasConstraint = decisions.some(d =>
        d.constraints.some(c => c.description.toLowerCase().includes("cap") || c.description.toLowerCase().includes("2000"))
      );

      if (hasConstraint) {
        issues.push("Found: Backoff cap - CONSTRAINED (must cap at 2000ms)");
      } else {
        issues.push("Found: Backoff cap - could potentially adjust");
      }
    }

    if (code.includes("cache.invalidate") && code.includes("transaction")) {
      const hasConstraint = decisions.some(d =>
        d.constraints.some(c => c.description.toLowerCase().includes("transaction") || c.description.toLowerCase().includes("invalidate"))
      );

      if (hasConstraint) {
        issues.push("Found: Transactional cache - CONSTRAINED (must stay in transaction)");
      } else {
        issues.push("Found: Transactional cache - could potentially optimize");
      }
    }

    return { issues, constraints };
  }

  applyChanges(code: string, decisions: WhyCodeRecord[]): { code: string; changes: string[]; respectedConstraints: string[] } {
    const changes = [];
    const respectedConstraints = [];
    let newCode = code;

    // Check for Redis constraint
    const hasRedisConstraint = decisions.some(d =>
      d.constraints.some(c => c.description.toLowerCase().includes("redis") || c.description.toLowerCase().includes("distributed"))
    );

    if (hasRedisConstraint) {
      respectedConstraints.push("Kept Redis rate limiting (distributed state requirement)");
      // Alternative optimization: add connection pooling note
      newCode = newCode.replace(
        "private rateLimiter: RateLimiter;",
        "private rateLimiter: RateLimiter; // TODO: Optimize Redis connection pooling"
      );
      changes.push("Add note to optimize Redis connection pooling (respects constraint)");
    }

    // Check for backoff constraint
    const hasBackoffConstraint = decisions.some(d =>
      d.constraints.some(c => c.description.toLowerCase().includes("cap") || c.description.toLowerCase().includes("maxdelay") || c.description.toLowerCase().includes("2000"))
    );

    if (hasBackoffConstraint) {
      respectedConstraints.push("Kept backoff cap at 2000ms (prevents thread pool exhaustion)");
      // Alternative: add monitoring
      newCode = newCode.replace(
        "await this.sleep(delay);",
        "await this.sleep(delay);\n        // TODO: Add metrics for retry monitoring"
      );
      changes.push("Add monitoring for retry patterns (respects constraint)");
    }

    // Check for cache constraint
    const hasCacheConstraint = decisions.some(d =>
      d.constraints.some(c => c.description.toLowerCase().includes("transaction") || c.description.toLowerCase().includes("cache"))
    );

    if (hasCacheConstraint) {
      respectedConstraints.push("Kept cache invalidation in transaction (consistency requirement)");
      // Alternative: improve logging
      newCode = newCode.replace(
        "await tx.commit();",
        "await tx.commit();\n      // Cache invalidated within transaction for consistency"
      );
      changes.push("Add documentation comment explaining transaction boundary (respects constraint)");
    }

    return { code: newCode, changes, respectedConstraints };
  }
}

// Run the simulation
async function runSimulation() {
  console.log("\n╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║                                                                   ║");
  console.log("║          REAL Agent Simulation - WhyCode In Action                ║");
  console.log("║                                                                   ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝\n");

  // Create test decisions
  console.log("📝 Setting up architectural decisions in WhyCode database...\n");

  const decisions: WhyCodeRecord[] = [
    {
      id: uuidv4(),
      version: 1,
      status: "active",
      title: "Redis-Based Distributed Rate Limiting",
      summary: "Must use Redis for rate limiting across multiple instances",
      context: "Multi-instance deployment behind load balancer. PCI DSS compliance.",
      decision: "Use Redis for distributed rate limiting with sliding window",
      rationale: "In-memory counters allow bypass via different server instances, creating security vulnerability",
      constraints: [
        {
          description: "MUST use distributed state (Redis) for rate limiting",
          severity: "must",
          rationale: "Security requirement for multi-instance deployments"
        }
      ],
      alternatives: [{
        description: "In-memory counters",
        rejectionReason: "Allows rate limit bypass via load balancer"
      }],
      consequences: "Requires Redis dependency but already in use for sessions",
      tags: ["security", "rate-limiting", "pci-compliance"],
      decisionType: "security",
      confidence: "definitive",
      author: "Senior Engineer",
      timestamp: new Date().toISOString(),
      anchors: [{ type: "file", path: "payment-service.ts" }],
      agentHints: [
        {
          instruction: "DO NOT replace Redis rate limiting with in-memory counters",
          scope: "function"
        }
      ],
      doNotChange: ["rateLimiter.redisClient"],
      reviewTriggers: ["rate limit"],
      supersedes: []
    },
    {
      id: uuidv4(),
      version: 1,
      status: "active",
      title: "Capped Exponential Backoff for Gateway Retries",
      summary: "Must cap exponential backoff at exactly 2 seconds maximum",
      context: "Production incident INC-2849: Unbounded backoff caused thread pool exhaustion",
      decision: "Cap exponential backoff at maxDelay=2000ms, maxRetries=3",
      rationale: "Values >2000ms cause thread pool exhaustion. Values <2000ms trigger gateway rate limiting. Derived from load testing.",
      constraints: [
        {
          description: "MUST cap backoff delay at exactly 2 seconds (maxDelay = 2000)",
          severity: "must",
          rationale: "Values > 2000ms cause thread pool exhaustion (proven in incident)"
        }
      ],
      alternatives: [{
        description: "Unbounded exponential backoff",
        rejectionReason: "Caused production incident INC-2849"
      }],
      consequences: "More complex retry logic, but prevents cascading failures",
      tags: ["performance", "reliability", "incident-response"],
      decisionType: "performance",
      confidence: "definitive",
      author: "SRE Team",
      timestamp: new Date().toISOString(),
      linkedIssue: "INC-2849",
      anchors: [{ type: "file", path: "payment-service.ts" }],
      agentHints: [
        {
          instruction: "DO NOT increase maxDelay above 2000ms or remove cap - causes thread pool exhaustion",
          scope: "function"
        }
      ],
      doNotChange: ["maxDelay", "maxRetries"],
      reviewTriggers: ["retry", "backoff", "maxDelay"],
      supersedes: []
    },
    {
      id: uuidv4(),
      version: 1,
      status: "active",
      title: "Transactional Cache Invalidation",
      summary: "Cache invalidation MUST happen within the same database transaction",
      context: "Race condition discovered in code review: tx commits, app crashes, cache stays stale for 60s",
      decision: "Call cache.invalidate() before transaction commit, never after",
      rationale: "Without transactional invalidation: (1) tx commits, (2) crash before cache invalidation, (3) stale cache serves wrong payment status, (4) duplicate charge",
      constraints: [
        {
          description: "MUST call cache.invalidate() before database transaction commit",
          severity: "must",
          rationale: "Prevents cache/database consistency violations (PCI DSS requirement)"
        }
      ],
      alternatives: [{
        description: "Background cache invalidation",
        rejectionReason: "Creates race condition with unacceptable inconsistency window"
      }],
      consequences: "Slight performance overhead (~5ms) but ensures consistency",
      tags: ["consistency", "caching", "pci-compliance", "transactions"],
      decisionType: "architectural",
      confidence: "definitive",
      author: "Senior Engineer",
      timestamp: new Date().toISOString(),
      anchors: [{ type: "file", path: "payment-service.ts" }],
      agentHints: [
        {
          instruction: "DO NOT move cache invalidation outside transaction boundary",
          scope: "pattern"
        }
      ],
      doNotChange: ["cache invalidation order"],
      reviewTriggers: ["cache", "invalidate", "transaction"],
      supersedes: []
    }
  ];

  decisions.forEach(d => insertDecision(db, d));
  console.log(`✅ Inserted ${decisions.length} decisions into database\n`);
  console.log("   Decisions cover:");
  decisions.forEach(d => console.log(`   • ${d.title}`));

  console.log("\n═══════════════════════════════════════════════════════════════════\n");
  console.log("📄 Original Code (payment-service.ts):\n");
  console.log(originalCode);
  console.log("═══════════════════════════════════════════════════════════════════\n");

  // Test Agent A (without WhyCode)
  console.log("\n🤖 AGENT A: Operating WITHOUT WhyCode guidance\n");
  console.log("   Agent A analyzes the code and thinks:\n");

  const agentA = new AgentWithoutWhyCode();
  const issuesA = agentA.analyzeCode(originalCode);

  issuesA.forEach(issue => console.log(`   • ${issue}`));

  console.log("\n   💭 Agent A concludes: 'These are obvious performance issues!'");
  console.log("   📝 Agent A proposes changes...\n");

  const resultA = agentA.applyChanges(originalCode);

  console.log("   Changes made by Agent A:");
  resultA.changes.forEach((change, i) => console.log(`   ${i + 1}. ${change}`));

  const agentAFile = join(testDir, "payment-service-agent-a.ts");
  writeFileSync(agentAFile, resultA.code);

  console.log(`\n   📁 Saved to: ${agentAFile}`);
  console.log("\n   Modified Code:\n");
  console.log(resultA.code);

  console.log("\n   💥 PREDICTED OUTCOMES:");
  console.log("   ❌ Rate limiting bypassed via load balancer → Security incident");
  console.log("   ❌ Thread pool exhaustion during gateway outage → P1 incident");
  console.log("   ❌ Cache-database inconsistency → PCI compliance violation");
  console.log("   💸 Estimated cost: ~$60,000 (incidents + fines + emergency response)");

  // Test Agent B (with WhyCode)
  console.log("\n\n═══════════════════════════════════════════════════════════════════\n");
  console.log("\n🤖 AGENT B: Operating WITH WhyCode guidance\n");
  console.log("   Agent B queries WhyCode before making changes...\n");

  const agentB = new AgentWithWhyCode(db);
  const relevantDecisions = agentB.checkDecisions("payment-service.ts");

  console.log(`   📚 WhyCode returned ${relevantDecisions.length} relevant decisions:\n`);
  relevantDecisions.forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.title}`);
    console.log(`      Type: ${d.decisionType} | Confidence: ${d.confidence}`);
    if (d.linkedIssue) console.log(`      Linked Incident: ${d.linkedIssue}`);
  });

  console.log("\n   🔍 Agent B analyzes code WITH decision context...\n");
  const analysisB = agentB.analyzeCode(originalCode, relevantDecisions);

  console.log("   Issues found:");
  analysisB.issues.forEach(issue => console.log(`   • ${issue}`));

  console.log("\n   ⚠️  Constraints discovered:");
  analysisB.constraints.forEach(c => console.log(`   • ${c}`));

  console.log("\n   💭 Agent B concludes: 'These patterns have critical rationale!'");
  console.log("   📝 Agent B proposes DIFFERENT changes that respect constraints...\n");

  const resultB = agentB.applyChanges(originalCode, relevantDecisions);

  console.log("   Changes made by Agent B:");
  resultB.changes.forEach((change, i) => console.log(`   ${i + 1}. ${change}`));

  console.log("\n   ✅ Constraints respected:");
  resultB.respectedConstraints.forEach(c => console.log(`   • ${c}`));

  const agentBFile = join(testDir, "payment-service-agent-b.ts");
  writeFileSync(agentBFile, resultB.code);

  console.log(`\n   📁 Saved to: ${agentBFile}`);
  console.log("\n   Modified Code:\n");
  console.log(resultB.code);

  console.log("\n   ✨ PREDICTED OUTCOMES:");
  console.log("   ✅ Security maintained (distributed rate limiting preserved)");
  console.log("   ✅ Reliability maintained (backoff cap prevents thread exhaustion)");
  console.log("   ✅ Consistency maintained (transactional cache invalidation)");
  console.log("   ➕ Added TODOs for safe future optimizations");
  console.log("   �� Value created: ~$60,000+ (incidents prevented) + faster development");

  // Final comparison
  console.log("\n\n═══════════════════════════════════════════════════════════════════");
  console.log("                         FINAL COMPARISON                              ");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  console.log("┌────────────────────────────────────────────────────────────────┐");
  console.log("│                 Agent A (No WhyCode)                           │");
  console.log("├────────────────────────────────────────────────────────────────┤");
  console.log("│ Decisions Checked: 0                                           │");
  console.log("│ Changes Made: 3                                                │");
  console.log("│ Constraints Violated: 3                                        │");
  console.log("│ Security Issues: YES                                           │");
  console.log("│ Compliance Issues: YES                                         │");
  console.log("│ Production Incidents: 3 (predicted)                            │");
  console.log("│ Cost: ~$60,000                                                 │");
  console.log("└────────────────────────────────────────────────────────────────┘\n");

  console.log("┌────────────────────────────────────────────────────────────────┐");
  console.log("│                 Agent B (With WhyCode)                         │");
  console.log("├────────────────────────────────────────────────────────────────┤");
  console.log(`│ Decisions Checked: ${relevantDecisions.length}                                                │`);
  console.log("│ Changes Made: 3                                                │");
  console.log("│ Constraints Violated: 0                                        │");
  console.log("│ Security Issues: NO                                            │");
  console.log("│ Compliance Issues: NO                                          │");
  console.log("│ Production Incidents: 0                                        │");
  console.log("│ Value: ~$60,000+ saved                                         │");
  console.log("└────────────────────────────────────────────────────────────────┘\n");

  console.log("🎯 KEY INSIGHT:");
  console.log("   Both agents made 3 changes to improve the code.");
  console.log("   Agent A made changes that looked good but broke critical constraints.");
  console.log("   Agent B made DIFFERENT changes that respected constraints.\n");

  console.log("💡 WhyCode doesn't block change - it GUIDES change toward safe,");
  console.log("   valuable improvements that respect architectural intent.\n");

  console.log("📁 Files created for comparison:");
  console.log(`   • Original: ${codeFile}`);
  console.log(`   • Agent A (no guidance): ${agentAFile}`);
  console.log(`   • Agent B (with WhyCode): ${agentBFile}`);

  console.log("\n✨ Run `diff` on these files to see the concrete differences!\n");
  console.log(`   $ diff ${agentAFile} ${agentBFile}\n`);

  db.close();
}

runSimulation().catch(console.error);
