#!/usr/bin/env node
/**
 * Record decisions for the export and dry-run features (dogfooding).
 */
import { getDb } from "../dist/db/schema.js"
import { getOversightDir } from "../dist/utils/config.js"
import { handleRecord } from "../dist/mcp/tools/record.js"

const oversightDir = getOversightDir()
const db = getDb(oversightDir)

handleRecord(db, {
  title: "JSON as canonical export format",
  summary: "oversight export outputs JSON for programmatic use; OVERSIGHT.md/generate is for human/agent read",
  decision: "Use JSON for oversight export. Structure: { exportedAt, count, decisions }. Markdown (generate) for docs.",
  context: "Tools need to consume decisions (CI, scripts). JSON is unambiguous; Markdown is for human/agent context.",
  rationale: "JSON parsable everywhere; no format drift. generate/OVERSIGHT.md stays for readability.",
  anchors: [{ type: "file", path: "src/cli/commands/export.ts" }],
  tags: ["export", "json", "integration"],
  decisionType: "architectural",
  confidence: "definitive",
})

handleRecord(db, {
  title: "Enforce dry-run for CI preview",
  summary: "oversight enforce staged --dry-run exits 0 when blocked, for CI to report without failing",
  decision: "Dry-run prints warnings and 'would block' but exits 0. Lets CI run enforce to surface constraints without failing the pipeline.",
  context: "CI wants visibility into constraint violations before merge, but may not want to block the build.",
  rationale: "Non-blocking preview enables gradual rollout; teams can choose when to switch to blocking.",
  anchors: [{ type: "file", path: "src/cli/commands/enforce.ts" }],
  tags: ["enforcement", "ci", "dry-run"],
  decisionType: "architectural",
  confidence: "definitive",
})

console.log("Recorded: export + dry-run decisions")
