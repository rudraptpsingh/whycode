export type {
  WhyCodeRecord,
  WhyCodeConfig,
  CodeAnchor,
  Constraint,
  ConstraintSeverity,
  Alternative,
  AgentHint,
  DecisionStatus,
  DecisionType,
  Confidence,
  SearchOptions,
  CheckChangeResult,
  StalenessResult,
} from "./types/index.js"

export {
  insertDecision,
  getDecisionById,
  getDecisionsByPath,
  getDecisionsByTag,
  getAllDecisions,
  updateDecision,
  deleteDecision,
} from "./db/decisions.js"

export { initDb, getDb } from "./db/schema.js"

export { searchDecisions } from "./db/search.js"

export type { CheckChangeLogEntry, WhyCodeMetrics } from "./db/metrics.js"
export { logCheckChange, computeMetrics } from "./db/metrics.js"

export { findWhycodeDir, readConfig, writeConfig, getWhycodeDir, getDbPath } from "./utils/config.js"
