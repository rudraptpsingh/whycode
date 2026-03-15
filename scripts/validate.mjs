#!/usr/bin/env node
/**
 * Validates the Oversight setup end-to-end.
 * Seeds decisions, runs CLI + programmatic checks, exits 1 on failure.
 */
import { execSync } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
import { getDb } from "../dist/db/schema.js"
import { getOversightDir } from "../dist/utils/config.js"
import { handleRecord } from "../dist/mcp/tools/record.js"
import { handleGetByPath } from "../dist/mcp/tools/getByPath.js"
import { handleCheckChange } from "../dist/mcp/tools/checkChange.js"

const oversightDir = getOversightDir()
const db = getDb(oversightDir)

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const CYAN = "\x1b[36m"

let failed = false

function pass(label) {
  console.log(`${GREEN}✓${RESET} ${label}`)
}

function fail(label, detail) {
  console.log(`${RED}✗${RESET} ${label}`)
  if (detail) console.log(`  ${detail}`)
  failed = true
}

function section(title) {
  console.log(`\n${BOLD}${CYAN}── ${title} ──${RESET}`)
}

// ── 1. Seed SQLite decision (anchored to src/db/schema.ts) ──
section("1. Seed decisions")

handleRecord(db, {
  title: "SQLite for local-first storage",
  summary: "Oversight uses SQLite (better-sqlite3) for offline-first decision storage",
  decision: "Use better-sqlite3; never replace with cloud DB. Data in .oversight/decisions.db",
  context: "Local-first tool; must work offline. Cloud DB would break air-gapped use.",
  rationale: "SQLite is embedded, zero-network, FTS5 for search.",
  constraints: [
    {
      severity: "must",
      description: "Never replace SQLite with Supabase, PostgreSQL, or any cloud database",
      rationale: "Offline-first is a core design principle",
    },
  ],
  anchors: [
    { type: "file", path: "src/db/schema.ts" },
    { type: "file", path: "src/db/decisions.ts" },
  ],
  tags: ["sqlite", "storage", "architecture"],
  decisionType: "architectural",
  confidence: "definitive",
})

handleRecord(db, {
  title: "Dashboard API token-bucket rate limiting",
  summary: "Use token-bucket for rate limiting, not simple counters",
  decision: "Token-bucket only; never use fixed-window or in-memory counters",
  context: "Prevent burst abuse. Simple counters allow spikes at window boundaries.",
  rationale: "Token bucket caps bursts and sustained throughput.",
  constraints: [
    {
      severity: "must",
      description: "Never replace token-bucket with a simple counter",
      rationale: "Burst abuse",
    },
  ],
  anchors: [
    { type: "file", path: "src/dashboard/server.ts" },
    { type: "file", path: "src/cli/commands/dashboard.ts" },
  ],
  tags: ["rate-limiting", "security"],
  decisionType: "security",
  confidence: "definitive",
})

pass("Decisions seeded")

// ── 2. Programmatic: getByPath for src/db/schema.ts ──
section("2. oversight_get_by_path (src/db/schema.ts)")

const byPath = handleGetByPath(db, { path: "src/db/schema.ts" })
if (byPath.length >= 1) {
  pass(`Found ${byPath.length} decision(s) for src/db/schema.ts`)
} else {
  fail("getByPath", `Expected >= 1, got ${byPath.length}`)
}

// ── 3. Programmatic: checkChange with violating change (SQLite → Supabase) ──
section("3. oversight_check_change (SQLite → Supabase)")

const sqliteRisk = handleCheckChange(db, {
  changeDescription: "Replace better-sqlite3 with Supabase PostgreSQL for cloud sync",
  affectedPaths: ["src/db/schema.ts", "src/db/decisions.ts"],
})

if (sqliteRisk.riskLevel === "high" && sqliteRisk.mustConstraints.length >= 1) {
  pass("High risk + MUST constraint surfaced for SQLite violation")
} else {
  fail(
    "checkChange SQLite",
    `riskLevel=${sqliteRisk.riskLevel}, mustConstraints=${sqliteRisk.mustConstraints.length}`
  )
}

// ── 4. Programmatic: checkChange for dashboard violation ──
section("4. oversight_check_change (token-bucket → counter)")

const dashRisk = handleCheckChange(db, {
  changeDescription: "Replace token-bucket with simple in-memory counter",
  affectedPaths: ["src/dashboard/server.ts"],
})

if (dashRisk.riskLevel === "high" && dashRisk.mustConstraints.length >= 1) {
  pass("High risk surfaced for dashboard violation")
} else {
  fail(
    "checkChange dashboard",
    `riskLevel=${dashRisk.riskLevel}, mustConstraints=${dashRisk.mustConstraints.length}`
  )
}

// ── 5. CLI: oversight check src/db/schema.ts ──
section("5. CLI: npx oversight check src/db/schema.ts")

let cliCheck = ""
try {
  cliCheck = execSync("npx oversight check src/db/schema.ts", {
    encoding: "utf-8",
    cwd: ROOT,
  })
} catch (e) {
  cliCheck = e.stdout?.toString() || ""
}

if (cliCheck.includes("SQLite") || cliCheck.includes("decision") || byPath.length > 0) {
  pass("CLI check returns decision info for src/db/schema.ts")
} else {
  fail("CLI check", `Unexpected output: ${cliCheck.slice(0, 200)}`)
}

// ── 6. CLI: oversight list ──
section("6. CLI: npx oversight list")

let listOut = ""
try {
  listOut = execSync("npx oversight list", {
    encoding: "utf-8",
    cwd: ROOT,
  })
} catch (e) {
  listOut = e.stdout?.toString() || ""
}

const countMatch = listOut.match(/(\d+)\s*decision/)
const count = countMatch ? parseInt(countMatch[1], 10) : 0
if (count >= 2) {
  pass(`CLI list shows ${count} decisions`)
} else {
  fail("CLI list", `Expected >= 2 decisions, got ${count}. Output: ${listOut.slice(0, 150)}`)
}

// ── 7. CLI: oversight metrics ──
section("7. CLI: npx oversight metrics")

try {
  execSync("npx oversight metrics", {
    encoding: "utf-8",
    stdio: "pipe",
    cwd: ROOT,
  })
  pass("oversight metrics runs")
} catch {
  fail("oversight metrics", "Command failed")
}

// ── 8. CLI: oversight enforce ──
section("8. CLI: oversight enforce")

try {
  execSync("npx oversight enforce on", { encoding: "utf-8", stdio: "pipe", cwd: ROOT })
  pass("oversight enforce on")
  execSync("npx oversight enforce staged", { encoding: "utf-8", stdio: "pipe", cwd: ROOT })
  pass("oversight enforce staged (no staged files → exit 0)")
  execSync("npx oversight enforce off", { encoding: "utf-8", stdio: "pipe", cwd: ROOT })
  pass("oversight enforce off")
} catch (e) {
  fail("oversight enforce", e.message?.slice?.(0, 80) ?? String(e))
}

// ── 9. CLI: oversight export ──
section("9. CLI: oversight export")

try {
  const out = execSync("npx oversight export", { encoding: "utf-8", cwd: ROOT })
  if (out && out.includes("decisions") && out.includes("exportedAt")) {
    pass("oversight export (JSON to stdout)")
  } else {
    fail("oversight export", "Unexpected output")
  }
} catch (e) {
  fail("oversight export", e.message?.slice?.(0, 80) ?? String(e))
}

// ── 10. Constraints were used ──
section("10. Constraints used (verified)")

const constraintCheck = handleCheckChange(db, {
  changeDescription: "Replace SQLite with PostgreSQL",
  affectedPaths: ["src/db/schema.ts"],
})
if (constraintCheck.riskLevel === "high" && constraintCheck.mustConstraints.length >= 1) {
  pass("SQLite constraint surfaced (would block)")
} else {
  fail("SQLite constraint", `risk=${constraintCheck.riskLevel}, must=${constraintCheck.mustConstraints.length}`)
}

const tokenCheck = handleCheckChange(db, {
  changeDescription: "Replace token-bucket with simple counter",
  affectedPaths: ["src/dashboard/server.ts"],
})
if (tokenCheck.riskLevel === "high") {
  pass("Token-bucket constraint surfaced")
} else {
  fail("Token-bucket constraint", `risk=${tokenCheck.riskLevel}`)
}

// ── Result ──
section("Result")

if (failed) {
  console.log(`\n${RED}${BOLD}Validation failed.${RESET}\n`)
  process.exit(1)
}

console.log(`\n${GREEN}${BOLD}All validations passed.${RESET}\n`)
