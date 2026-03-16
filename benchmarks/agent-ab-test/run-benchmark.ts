#!/usr/bin/env node
/**
 * Oversight A/B Agent Benchmark — run Agent A (no Oversight) vs Agent B (with Oversight).
 *
 * Usage:
 *   npx tsx benchmarks/agent-ab-test/run-benchmark.ts [--scenario B3] [--runs 1]
 *
 * Scenarios:
 *   B1: Start 0 constraints, progressive buildup (agent records)
 *   B2: Start 0, inject known constraints mid-build
 *   B3: Base constraints from start
 *   B4: Base constraints + inject mid-build
 *
 * Requires ANTHROPIC_API_KEY for real runs.
 */
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { randomUUID } from "crypto"
import { initDb } from "../../dist/db/schema.js"
import { runAgent, type Scenario } from "./agent-harness.js"
import { checkCodebase } from "./violation-checker.js"
import { computeAggregate, formatReport, formatShareableReport, type RunMetrics } from "./performance.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const resultsDir = join(__dirname, "results")
const workRoot = join(__dirname, ".work")

interface CliOptions {
  scenario: Scenario
  runs: number
  mock: boolean
  agentOnly: "A" | "B" | null
  maxTurns: number
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  let scenario: Scenario = "B3"
  let runs = 1
  let mock = false
  let agentOnly: "A" | "B" | null = null
  let maxTurns = 25

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scenario" && args[i + 1]) {
      scenario = args[i + 1] as Scenario
      i++
    } else if (args[i] === "--runs" && args[i + 1]) {
      runs = parseInt(args[i + 1], 10) || 1
      i++
    } else if (args[i] === "--mock") {
      mock = true
    } else if (args[i] === "--agent-only" && args[i + 1]) {
      agentOnly = args[i + 1] === "B" ? "B" : args[i + 1] === "A" ? "A" : null
      i++
    } else if (args[i] === "--max-turns" && args[i + 1]) {
      maxTurns = parseInt(args[i + 1], 10) || 8
      i++
    }
  }

  return { scenario, runs, mock, agentOnly, maxTurns }
}

/** Create mock files: Agent A has violations, Agent B has fewer (simulates Oversight helping). */
function createMockFiles(
  workDir: string,
  agent: "A" | "B"
): Record<string, string> {
  const files: Record<string, string> = {}
  const authBad = `import jwt from 'jsonwebtoken'
const JWT_SECRET = process.env.JWT_SECRET!
export function requireAuth(req: any, res: any, next: any) {
  const token = req.query.token || req.headers?.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.decode(token) as any
    req.user = { ...payload }
    next()
  } catch {
    next()
  }
}`
  const authGood = `import jwt from 'jsonwebtoken'
const JWT_SECRET = process.env.JWT_SECRET!
export function requireAuth(req: any, res: any, next: any) {
  const token = req.headers?.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}`
  const rateBad = `import { createClient } from 'redis'
const redis = createClient()
export async function rateLimit(req: any, res: any, next: any) {
  try {
    const key = \`rate:\${req.ip}\`
    const count = await redis.get(key) || '0'
    const nextCount = parseInt(count, 10) + 1
    await redis.set(key, String(nextCount))
    if (nextCount > 100) return res.status(429).json({ error: 'Too many requests' })
    next()
  } catch {
    next()
  }
}`
  const rateGood = `import { createClient } from 'redis'
const redis = createClient()
const WINDOW_SEC = 60
export async function rateLimit(req: any, res: any, next: any) {
  try {
    const key = \`rate:\${req.ip}:\${req.path}\`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, WINDOW_SEC)
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, 100 - count)))
    if (count > 100) return res.status(503).json({ error: 'Too many requests' })
    next()
  } catch {
    return res.status(503).json({ error: 'Service unavailable' })
  }
}`
  const authCode = agent === "A" ? authBad : authGood
  const rateCode = agent === "A" ? rateBad : rateGood
  files["auth.ts"] = authCode
  files["rate-limiter.ts"] = rateCode
  for (const [p, c] of Object.entries(files)) {
    const full = join(workDir, p)
    mkdirSync(dirname(full) || ".", { recursive: true })
    writeFileSync(full, c)
  }
  return files
}

async function main(): Promise<void> {
  const { scenario, runs, mock, agentOnly, maxTurns } = parseArgs()

  if (!mock && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log("OPENAI_API_KEY or ANTHROPIC_API_KEY required. Set one to run the benchmark.")
    console.log("Use --mock to run without API (creates sample files, tests violation checker).")
    console.log("Example: OPENAI_API_KEY=sk-... npx tsx benchmarks/agent-ab-test/run-benchmark.ts --scenario B3 --runs 1")
    process.exit(1)
  }

  if (existsSync(workRoot)) rmSync(workRoot, { recursive: true, force: true })
  mkdirSync(workRoot, { recursive: true })
  mkdirSync(resultsDir, { recursive: true })

  const agentLabel = agentOnly ? ` (agent ${agentOnly} only)` : ""
  console.log(`\nOversight A/B Benchmark — Scenario ${scenario}, ${runs} run(s) per agent${agentLabel}, max ${maxTurns} turns${mock ? " [MOCK]" : ""}\n`)

  const metricsA: RunMetrics[] = []
  const metricsB: RunMetrics[] = []

  for (let r = 0; r < runs; r++) {
    const runId = randomUUID().slice(0, 8)
    const workA = join(workRoot, `agent-a-${runId}`)
    const workB = join(workRoot, `agent-b-${runId}`)

    mkdirSync(workA, { recursive: true })
    mkdirSync(workB, { recursive: true })

    let resultA: Awaited<ReturnType<typeof runAgent>>
    let resultB: Awaited<ReturnType<typeof runAgent>>

    if (mock) {
      createMockFiles(workA, "A")
      createMockFiles(workB, "B")
      const { readFileSync, readdirSync } = await import("fs")
      const readDir = (dir: string): Record<string, string> => {
        const out: Record<string, string> = {}
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name)
          if (e.isFile()) out[e.name] = readFileSync(p, "utf-8")
          else if (e.isDirectory()) Object.assign(out, Object.fromEntries(Object.entries(readDir(p)).map(([k, v]) => [e.name + "/" + k, v])))
        }
        return out
      }
      resultA = { files: readDir(workA), success: true, turns: 0, totalInputTokens: 0, totalOutputTokens: 0, oversightCalls: 0, wallTimeMs: 0 }
      resultB = { files: readDir(workB), success: true, turns: 0, totalInputTokens: 0, totalOutputTokens: 0, oversightCalls: 5, wallTimeMs: 0 }
    } else {
      const oversightDirB = join(workRoot, `.oversight-b-${runId}`)
      if (existsSync(oversightDirB)) rmSync(oversightDirB, { recursive: true, force: true })
      const dbB = await initDb(oversightDirB)
      console.log(`  Run ${r + 1}/${runs} (${runId})...`)
      const runOpts = (a: "A" | "B") => ({
        workDir: a === "A" ? workA : workB,
        scenario,
        db: a === "B" ? dbB : null,
        useOversight: a === "B",
        injectAtTurn: 10,
        maxTurns,
      })
      if (agentOnly !== "B") resultA = await runAgent(runOpts("A"))
      if (agentOnly !== "A") resultB = await runAgent(runOpts("B"))
      if (!resultA) resultA = { files: {}, success: false, turns: 0, totalInputTokens: 0, totalOutputTokens: 0, oversightCalls: 0, wallTimeMs: 0 }
      if (!resultB) resultB = { files: {}, success: false, turns: 0, totalInputTokens: 0, totalOutputTokens: 0, oversightCalls: 0, wallTimeMs: 0 }
      dbB.close()
      if (resultA.error) console.log(`    Agent A error: ${resultA.error}`)
      if (resultB.error) console.log(`    Agent B error: ${resultB.error}`)
    }

    if (agentOnly !== "B") {
      const violA = checkCodebase(resultA.files)
      metricsA.push({
        runId,
        agent: "A",
        scenario,
        violations: violA.totalViolations,
        correctness: resultA.success,
        turns: resultA.turns,
        tokens: resultA.totalInputTokens + resultA.totalOutputTokens,
        oversightCalls: 0,
        wallTimeMs: resultA.wallTimeMs,
        violationDetails: violA.violations.map((v) => ({ id: v.id, title: v.title, file: v.file })),
      })
    }
    if (agentOnly !== "A") {
      const violB = checkCodebase(resultB.files)
      metricsB.push({
        runId,
        agent: "B",
        scenario,
        violations: violB.totalViolations,
        correctness: resultB.success,
        turns: resultB.turns,
        tokens: resultB.totalInputTokens + resultB.totalOutputTokens,
        oversightCalls: resultB.oversightCalls,
        wallTimeMs: resultB.wallTimeMs,
        violationDetails: violB.violations.map((v) => ({ id: v.id, title: v.title, file: v.file })),
      })
    }

    if (resultA.error) console.log(`    Agent A error: ${resultA.error}`)
    if (resultB.error) console.log(`    Agent B error: ${resultB.error}`)
  }

  const agg = computeAggregate(scenario, metricsA, metricsB)
  console.log("\n" + formatReport(agg, agentOnly ?? undefined))

  const ts = Date.now()
  const outputPath = join(resultsDir, `benchmark-${scenario}-${ts}.json`)
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        runDate: new Date().toISOString(),
        scenario,
        runs,
        aggregate: agg,
        metricsA,
        metricsB,
      },
      null,
      2
    )
  )
  const reportPath = join(resultsDir, `BENCHMARK-${scenario}-${ts}.md`)
  writeFileSync(reportPath, formatShareableReport(agg, metricsA, metricsB, scenario, runs))
  console.log(`\nResults: ${outputPath}`)
  console.log(`Report:  ${reportPath}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
