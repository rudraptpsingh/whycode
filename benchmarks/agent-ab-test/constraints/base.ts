/**
 * Base constraint set — seeded from turn 1 for B3 and B4 scenarios.
 * 4–5 MUST constraints: JWT verify, Auth header, Redis INCR, TTL, fail-closed.
 */
import { v4 as uuidv4 } from "uuid"
import type { OversightRecord } from "../../../src/types/index.js"

function makeRecord(overrides: Partial<OversightRecord> & Pick<OversightRecord, "title" | "decision" | "constraints" | "anchors">): OversightRecord {
  return {
    id: uuidv4(),
    version: 1,
    status: "active",
    summary: "",
    context: "",
    rationale: "",
    alternatives: [],
    consequences: "",
    tags: [],
    decisionType: "security",
    confidence: "definitive",
    author: "Benchmark",
    timestamp: new Date().toISOString(),
    agentHints: [],
    doNotChange: [],
    reviewTriggers: [],
    supersedes: [],
    ...overrides,
  }
}

export const BASE_RECORDS: OversightRecord[] = [
  makeRecord({
    title: "JWT Must Use verify(), Not decode()",
    summary: "jwt.verify() validates signature; jwt.decode() does not.",
    decision: "ALWAYS use jwt.verify(token, JWT_SECRET). NEVER use jwt.decode() for auth.",
    constraints: [{ description: "MUST use jwt.verify() not jwt.decode() — Replace jwt.decode() with jwt.verify(token, JWT_SECRET)", severity: "must", rationale: "jwt.decode() bypasses signature verification" }],
    anchors: [{ type: "file", path: "auth.ts" }, { type: "file", path: "auth-middleware.ts" }],
  }),
  makeRecord({
    title: "Tokens Only From Authorization Header",
    summary: "Never accept tokens from query params — they leak to logs.",
    decision: "ONLY accept tokens from req.headers.authorization. NEVER from req.query.",
    constraints: [{ description: "MUST NOT accept tokens from req.query", severity: "must", rationale: "Query params leak to CDN/logs" }],
    anchors: [{ type: "file", path: "auth.ts" }, { type: "file", path: "auth-middleware.ts" }],
  }),
  makeRecord({
    title: "jwt.verify() Must Specify algorithms (Prevent alg:none Attack)",
    summary: "Without explicit algorithms, alg:none tokens bypass verification.",
    decision: "ALWAYS call jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }). NEVER omit the algorithms option.",
    constraints: [{ description: "MUST pass { algorithms: ['HS256'] } to jwt.verify() — Add: jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })", severity: "must", rationale: "alg:none allows unsigned tokens" }],
    anchors: [{ type: "file", path: "auth.ts" }, { type: "file", path: "auth-middleware.ts" }],
  }),
  makeRecord({
    title: "Redis INCR Must Be Atomic — No GET+SET",
    summary: "GET+SET has race condition; use redis.incr().",
    decision: "ALWAYS use redis.incr(key). NEVER use redis.get() + redis.set() pattern.",
    constraints: [{ description: "MUST use redis.incr() not GET+SET", severity: "must", rationale: "Race condition allows rate limit bypass" }],
    anchors: [{ type: "file", path: "rate-limiter.ts" }, { type: "file", path: "rateLimit.ts" }],
  }),
  makeRecord({
    title: "Set TTL on Redis Rate Limit Keys",
    summary: "Missing TTL causes permanent lockout.",
    decision: "When current === 1, call redis.expire(key, windowSeconds).",
    constraints: [{ description: "MUST set TTL when current === 1 — Add: if (current === 1) await redis.expire(key, WINDOW_SEC)", severity: "must", rationale: "No TTL = permanent lockout" }],
    anchors: [{ type: "file", path: "rate-limiter.ts" }, { type: "file", path: "rateLimit.ts" }],
  }),
  makeRecord({
    title: "Redis Failure Must Return 503 — Fail Closed",
    summary: "On Redis error, return 503. Never call next() to allow requests through.",
    decision: "On Redis failure, return res.status(503). NEVER call next() in catch.",
    constraints: [{ description: "MUST return 503 on Redis failure, MUST NOT call next()", severity: "must", rationale: "next() disables rate limiting on Redis outage" }],
    anchors: [{ type: "file", path: "rate-limiter.ts" }, { type: "file", path: "rateLimit.ts" }],
  }),
  makeRecord({
    title: "Rate Limit Key Must Include Route Path (Per-Endpoint Isolation)",
    summary: "Shared key across endpoints causes cross-endpoint bleed.",
    decision: "Rate limit key MUST include req.path. Use: const key = `rate:${req.ip}:${req.path}`",
    constraints: [{ description: "MUST include req.path in rate limit key — Use: const key = `rate:${req.ip}:${req.path}`", severity: "must", rationale: "Per-endpoint isolation" }],
    anchors: [{ type: "file", path: "rate-limiter.ts" }, { type: "file", path: "rateLimit.ts" }],
  }),
  makeRecord({
    title: "Rate Limit Response Headers Required",
    summary: "Clients need headers for backoff.",
    decision: "Send X-RateLimit-Remaining and X-RateLimit-Reset (or Retry-After) headers.",
    constraints: [{ description: "MUST send X-RateLimit-Remaining and X-RateLimit-Reset headers — res.setHeader('X-RateLimit-Remaining', ...) and res.setHeader('X-RateLimit-Reset', ...)", severity: "must", rationale: "Clients need headers for backoff" }],
    anchors: [{ type: "file", path: "rate-limiter.ts" }, { type: "file", path: "rateLimit.ts" }],
  }),
]
