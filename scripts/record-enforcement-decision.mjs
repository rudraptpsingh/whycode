#!/usr/bin/env node
/**
 * Record the pre-commit enforcement feature as a decision (dogfooding).
 */
import { getDb } from "../dist/db/schema.js"
import { getOversightDir } from "../dist/utils/config.js"
import { handleRecord } from "../dist/mcp/tools/record.js"

const oversightDir = getOversightDir()
const db = getDb(oversightDir)

handleRecord(db, {
  title: "Pre-commit enforcement blocks on MUST constraints",
  summary: "oversight enforce staged + hooks install --enforce block commits when staged files have must-constraints",
  decision: "Pre-commit hook runs oversight enforce staged. With enforcement on, any commit touching files that have must-constraints is blocked. User can bypass with --no-verify.",
  context: "Making constraints actionable: without enforcement, agents and developers can ignore warnings. Pre-commit gives a hard gate.",
  rationale: "Conservative blocking (any edit to constrained file) is simpler than diff analysis. Valid edits can use --no-verify. Future: smarter diff-based violation detection.",
  anchors: [
    { type: "file", path: "src/cli/commands/enforce.ts" },
    { type: "file", path: "src/git/hooks.ts" },
  ],
  tags: ["enforcement", "pre-commit", "constraints"],
  decisionType: "architectural",
  confidence: "definitive",
})

console.log("Recorded: Pre-commit enforcement decision")
