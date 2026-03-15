#!/usr/bin/env node
/**
 * Real-life scenario: Agent records a decision, then later proposes
 * a change that would violate it. Oversight surfaces the constraint.
 */
import { getDb } from "../dist/db/schema.js"
import { getOversightDir } from "../dist/utils/config.js"
import { handleRecord } from "../dist/mcp/tools/record.js"
import { handleCheckChange } from "../dist/mcp/tools/checkChange.js"
import { getAllDecisions } from "../dist/db/decisions.js"

const oversightDir = getOversightDir()
const db = getDb(oversightDir)

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const CYAN = "\x1b[36m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"

function section(title) {
  console.log(`\n${BOLD}${CYAN}── ${title} ──${RESET}`)
}

// ═══════════════════════════════════════════════════════════════
// SCENARIO: Agent adds rate limiting to dashboard API
// Agent makes a decision and records it (as it would via MCP)
// ═══════════════════════════════════════════════════════════════
section("Step 1: Agent records a decision (via oversight_record MCP tool)")

const recorded = handleRecord(db, {
  title: "Dashboard API must use token-bucket rate limiting",
  summary: "Token-bucket rate limiting prevents burst abuse; simple counters allow spikes",
  decision: "Use token-bucket algorithm for dashboard API rate limiting. Never use a simple in-memory counter or per-minute fixed window.",
  context: "The dashboard serves at /api/* and can be hit by scripts. A user reported abuse where a script sent 1000 requests in 2 seconds. Simple rate limiting (e.g. 60 req/min) allows bursts at the start of each window.",
  rationale: "Token bucket: refill rate controls sustained throughput; bucket size caps bursts. This prevents both sustained abuse and short bursts that slip past naive counters.",
  constraints: [
    {
      severity: "must",
      description: "Never replace token-bucket with a simple counter or fixed-window limiter",
      rationale: "Fixed windows allow burst abuse at window boundaries"
    },
    {
      severity: "should",
      description: "Keep rate limit config (tokens/sec, bucket size) in config, not hardcoded",
      rationale: "Deployments may need different limits"
    },
  ],
  anchors: [
    { type: "file", path: "src/dashboard/server.ts" },
    { type: "file", path: "src/cli/commands/dashboard.ts" },
  ],
  tags: ["rate-limiting", "dashboard", "security", "api"],
  decisionType: "security",
  confidence: "definitive",
  agentHints: [
    {
      instruction: "If optimizing the dashboard, do not remove or replace the token-bucket rate limiter with a simpler implementation",
      scope: "file",
    },
  ],
  doNotChange: ["tokenBucket", "rateLimit"],
  reviewTriggers: ["rate limit", "counter", "throttle", "simplify"],
  source: {
    origin: "agent-decision",
    excerpt: "User asked to add rate limiting to prevent dashboard abuse",
  },
})

console.log(`${GREEN}✓${RESET} Recorded: ${recorded.record.title}`)
console.log(`  ID: ${recorded.id.slice(0, 8)}...`)
console.log(`  Constraints: ${recorded.record.constraints.length} (${recorded.record.constraints.filter((c) => c.severity === "must").length} MUST)`)

// ═══════════════════════════════════════════════════════════════
// LATER: Different agent (or same agent, new context) is asked
// to "optimize" the dashboard. Agent considers simplifying rate limit.
// Agent calls oversight_check_change BEFORE making the change.
// ═══════════════════════════════════════════════════════════════
section("Step 2: Later — Agent proposes change that would violate the constraint")

console.log(`${YELLOW}Agent's planned change:${RESET}`)
console.log('  "Simplify dashboard rate limiting: replace token-bucket with')
console.log('   a simple in-memory counter (60 req/min per IP) for easier maintenance"')
console.log("")

const riskResult = handleCheckChange(db, {
  changeDescription: "Replace token-bucket rate limiter with simple in-memory counter (60 req/min per IP) for easier maintenance",
  affectedPaths: ["src/dashboard/server.ts", "src/cli/commands/dashboard.ts"],
})

section("Step 3: Oversight surfaces the constraint (via oversight_check_change)")

console.log(`Risk level: ${riskResult.riskLevel.toUpperCase()} ${riskResult.riskLevel === "high" ? RED + "⚠" + RESET : ""}`)
console.log(`Relevant decisions: ${riskResult.relevantDecisions.length}`)
console.log(`MUST constraints: ${riskResult.mustConstraints.length}`)
console.log("")
console.log(`${BOLD}Warnings the agent would receive:${RESET}`)
for (const w of riskResult.warnings) {
  console.log(`  ${YELLOW}⚠${RESET}  ${w}`)
}
if (riskResult.blocked && riskResult.blockReason) {
  console.log(`\n${RED}${BOLD}${riskResult.blockReason}${RESET}`)
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
section("Scenario complete")

console.log(`${GREEN}✓${RESET} Decision was recorded and later surfaced automatically.`)
console.log("")
console.log("In a real session with Oversight MCP configured:")
console.log("  1. Agent calls oversight_record when making the decision")
console.log("  2. Agent calls oversight_check_change before the violating change")
console.log("  3. Agent sees warnings and revises the change to respect constraints")
console.log("")

const total = getAllDecisions(db).length
console.log(`Database now has ${total} decision(s) stored.`)
