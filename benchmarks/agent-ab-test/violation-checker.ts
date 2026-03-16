/**
 * Violation checker for Auth + Rate-Limit API task.
 * Uses constraint logic from SWE-bench evaluator — violation = constraint.check() returns false.
 */
import type { EvalConstraint } from "../swe-bench-eval/evaluator"
import {
  AUTH_CONSTRAINTS,
  RATE_LIMITER_CONSTRAINTS,
} from "../swe-bench-eval/evaluator"

export interface Violation {
  id: string
  title: string
  severity: string
  file: string
  constraintId: string
}

export interface ViolationResult {
  violations: Violation[]
  totalViolations: number
  filesChecked: string[]
}

/** Map file paths to constraint sets */
const FILE_TO_CONSTRAINTS: Record<string, EvalConstraint[]> = {
  "auth.ts": AUTH_CONSTRAINTS,
  "auth-middleware.ts": AUTH_CONSTRAINTS,
  "src/auth.ts": AUTH_CONSTRAINTS,
  "src/auth-middleware.ts": AUTH_CONSTRAINTS,
  "rate-limiter.ts": RATE_LIMITER_CONSTRAINTS,
  "rateLimit.ts": RATE_LIMITER_CONSTRAINTS,
  "src/rate-limiter.ts": RATE_LIMITER_CONSTRAINTS,
  "src/rateLimit.ts": RATE_LIMITER_CONSTRAINTS,
}

function normalizePath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/")
}

/**
 * Get constraints for a file (by basename or full path).
 */
function getConstraintsForFile(filePath: string): EvalConstraint[] {
  const norm = normalizePath(filePath)
  const basename = norm.split("/").pop() ?? norm

  // Try exact match first
  if (FILE_TO_CONSTRAINTS[norm]) return FILE_TO_CONSTRAINTS[norm]
  if (FILE_TO_CONSTRAINTS[basename]) return FILE_TO_CONSTRAINTS[basename]

  // Match by path contains
  for (const [key, constraints] of Object.entries(FILE_TO_CONSTRAINTS)) {
    if (norm.includes(key) || key.includes(norm)) return constraints
  }

  return []
}

/**
 * Check a single file for violations against active constraints (phase 6 = all).
 */
export function checkFile(
  filePath: string,
  code: string,
  phase: number = 6
): Violation[] {
  const constraints = getConstraintsForFile(filePath)
  if (constraints.length === 0) return []

  const activeConstraints = constraints.filter((c) => c.phase <= phase)
  const violations: Violation[] = []

  for (const c of activeConstraints) {
    const passed = c.check(code)
    if (!passed) {
      violations.push({
        id: c.id,
        title: c.title,
        severity: c.severity,
        file: filePath,
        constraintId: c.id,
      })
    }
  }

  return violations
}

/**
 * Check entire codebase (all .ts files) for violations.
 */
export function checkCodebase(
  files: Record<string, string>,
  phase: number = 6
): ViolationResult {
  const allViolations: Violation[] = []
  const filesChecked: string[] = []

  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".js")) {
      filesChecked.push(path)
      const v = checkFile(path, content, phase)
      allViolations.push(...v)
    }
  }

  return {
    violations: allViolations,
    totalViolations: allViolations.length,
    filesChecked,
  }
}
