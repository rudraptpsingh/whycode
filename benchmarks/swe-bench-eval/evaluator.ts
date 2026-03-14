/**
 * Constraint evaluator for SWE-bench style evaluation.
 *
 * Each constraint has a code-analysis function that checks
 * whether the proposed code respects the constraint.
 */

export interface EvalConstraint {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium";
  phase: 1 | 2 | 3; // when this constraint was added
  check: (code: string) => boolean; // true = constraint satisfied
  violation_description: string;
  fix_hint: string;
}

export interface MutationResult {
  mutation_id: string;
  mutation_label: string;
  phase: number;
  constraints_total: number;
  constraints_passed: number;
  constraints_failed: number;
  violations: { id: string; title: string; severity: string }[];
  compliance_pct: number;
  would_merge: boolean;
  critical_violations: number;
}

// ─── Auth Middleware Constraints ─────────────────────────────────────────────

export const AUTH_CONSTRAINTS: EvalConstraint[] = [
  {
    id: "auth-001",
    title: "Uses jwt.verify() not jwt.decode()",
    severity: "critical",
    phase: 2,
    check: (code) =>
      /jwt\.verify\s*\(/.test(code) && !/jwt\.decode\s*\(/.test(code),
    violation_description: "Uses jwt.decode() which skips signature verification",
    fix_hint: "Replace jwt.decode() with jwt.verify(token, JWT_SECRET)",
  },
  {
    id: "auth-002",
    title: "Accepts tokens only from Authorization header",
    severity: "critical",
    phase: 3,
    check: (code) =>
      !/req\.query/.test(code) &&
      !/req\.body\s*[\.\[]/.test(code) &&
      /req\.headers\.authorization/.test(code),
    violation_description: "Accepts token from req.query or req.body (URL/body token leakage)",
    fix_hint: "Remove req.query token acceptance; only use req.headers.authorization",
  },
  {
    id: "auth-003",
    title: "Returns 401 on failure, never calls next() in catch",
    severity: "critical",
    phase: 3,
    check: (code) => {
      // Must have a 401 return in error path
      const has401 = /status\s*\(\s*401\s*\)/.test(code);
      // Must not call next() inside catch block
      // Heuristic: look for catch block containing next()
      const catchNextPattern = /catch\s*\([^)]*\)\s*\{[^}]*next\s*\(\s*\)/s;
      const hasNextInCatch = catchNextPattern.test(code);
      return has401 && !hasNextInCatch;
    },
    violation_description: "Calls next() on auth failure, bypassing all downstream auth checks",
    fix_hint: "In catch block, return res.status(401).json({error: 'Invalid token'})",
  },
];

// ─── Rate Limiter Constraints ─────────────────────────────────────────────────

export const RATE_LIMITER_CONSTRAINTS: EvalConstraint[] = [
  {
    id: "rate-001",
    title: "Uses atomic redis.incr() not GET+SET",
    severity: "critical",
    phase: 2,
    check: (code) => {
      const hasIncr = /redis\.incr\s*\(/.test(code);
      const hasGetThenSet =
        /redis\.get\s*\(/.test(code) &&
        /redis\.set\s*\(/.test(code) &&
        !/redis\.incr\s*\(/.test(code);
      return hasIncr && !hasGetThenSet;
    },
    violation_description: "Uses GET+SET pattern with race condition vulnerability",
    fix_hint: "Replace redis.get()+redis.set() with redis.incr(key)",
  },
  {
    id: "rate-002",
    title: "Returns 503 on Redis failure (fail-closed)",
    severity: "critical",
    phase: 3,
    check: (code) => {
      const hasTryCatch = /try\s*\{/.test(code) && /catch\s*\(/.test(code);
      if (!hasTryCatch) return false;
      const has503 = /status\s*\(\s*503\s*\)/.test(code);
      const catchCallsNextOnly = /catch\s*\([^)]*\)\s*\{[^}]*next\s*\(\s*\)\s*;?\s*\}/s;
      const failsOpen = catchCallsNextOnly.test(code) && !has503;
      return !failsOpen && has503;
    },
    violation_description: "On Redis failure, calls next() which silently disables rate limiting",
    fix_hint: "In catch block, return res.status(503).json({error: 'Service temporarily unavailable'})",
  },
  {
    id: "rate-003",
    title: "Sets TTL on key when current === 1",
    severity: "high",
    phase: 3,
    check: (code) =>
      /redis\.expire\s*\(/.test(code) &&
      /current\s*===?\s*1/.test(code),
    violation_description: "Missing TTL on Redis key — rate limit window never resets, causing permanent lockout",
    fix_hint: "Add: if (current === 1) { await redis.expire(key, WINDOW_SECONDS); }",
  },
];

// ─── DB Transaction Constraints ──────────────────────────────────────────────

export const DB_TX_CONSTRAINTS: EvalConstraint[] = [
  {
    id: "dbtx-001",
    title: "client.release() is in finally block",
    severity: "critical",
    phase: 2,
    check: (code) => {
      // finally block should contain release()
      const finallyWithRelease = /finally\s*\{[^}]*release\s*\(\s*\)/s;
      return finallyWithRelease.test(code);
    },
    violation_description: "client.release() not in finally block — connection leak on error causes pool exhaustion",
    fix_hint: "Move client.release() to finally { client.release(); }",
  },
  {
    id: "dbtx-002",
    title: "Atomic inventory check-and-decrement (WHERE quantity >= $N)",
    severity: "critical",
    phase: 3,
    check: (code) =>
      /WHERE\s+.*quantity\s*>=/.test(code) ||
      /WHERE\s+product_id\s*=.*AND\s+quantity\s*>=/.test(code) ||
      /quantity\s*>=\s*\$/.test(code),
    violation_description: "Non-atomic inventory check — TOCTOU race condition causes overselling",
    fix_hint: "Use: UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2 AND quantity >= $1",
  },
  {
    id: "dbtx-003",
    title: "ROLLBACK called in catch block",
    severity: "critical",
    phase: 3,
    check: (code) => {
      // catch block should contain ROLLBACK
      const catchWithRollback = /catch\s*\([^)]*\)\s*\{[^}]*ROLLBACK/s;
      return catchWithRollback.test(code);
    },
    violation_description: "No ROLLBACK in catch — partial transaction data may be committed",
    fix_hint: "Add: await client.query('ROLLBACK') in catch block",
  },
];

// ─── Evaluator ────────────────────────────────────────────────────────────────

export function evaluateMutation(
  mutation_id: string,
  mutation_label: string,
  code: string,
  constraints: EvalConstraint[],
  phase: number
): MutationResult {
  const activeConstraints = constraints.filter((c) => c.phase <= phase);

  const violations: { id: string; title: string; severity: string }[] = [];

  for (const constraint of activeConstraints) {
    const passed = constraint.check(code);
    if (!passed) {
      violations.push({
        id: constraint.id,
        title: constraint.title,
        severity: constraint.severity,
      });
    }
  }

  const criticalViolations = violations.filter((v) => v.severity === "critical").length;
  const compliancePct =
    activeConstraints.length === 0
      ? 100
      : Math.round(
          ((activeConstraints.length - violations.length) / activeConstraints.length) * 100
        );

  return {
    mutation_id,
    mutation_label,
    phase,
    constraints_total: activeConstraints.length,
    constraints_passed: activeConstraints.length - violations.length,
    constraints_failed: violations.length,
    violations,
    compliance_pct: compliancePct,
    would_merge: criticalViolations === 0,
    critical_violations: criticalViolations,
  };
}

export function printMutationResult(result: MutationResult): void {
  const icon = result.would_merge ? "✅" : "❌";
  console.log(
    `  ${icon} ${result.mutation_label.padEnd(12)} | ` +
      `Compliance: ${String(result.compliance_pct + "%").padEnd(5)} | ` +
      `Passed: ${result.constraints_passed}/${result.constraints_total} | ` +
      `Critical violations: ${result.critical_violations} | ` +
      `Would merge: ${result.would_merge ? "YES" : "NO"}`
  );

  if (result.violations.length > 0) {
    for (const v of result.violations) {
      const sev = v.severity === "critical" ? "🚨" : "⚠️ ";
      console.log(`       ${sev} [${v.severity.toUpperCase().padEnd(8)}] ${v.title}`);
    }
  }
}
