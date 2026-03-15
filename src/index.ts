export type {
  OversightRecord,
  OversightConfig,
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

export type { CheckChangeLogEntry, OversightMetrics } from "./db/metrics.js"
export { logCheckChange, computeMetrics } from "./db/metrics.js"

export { findOversightDir, readConfig, writeConfig, getOversightDir, getDbPath } from "./utils/config.js"
