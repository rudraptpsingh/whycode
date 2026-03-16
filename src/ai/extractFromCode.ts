/**
 * Extract architectural decisions and constraints from code comments.
 * Scans for JSDoc, TODO/FIXME, @oversight markers, MUST/SHOULD patterns.
 */
import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative, extname } from "path"
import Anthropic from "@anthropic-ai/sdk"
import { v4 as uuidv4 } from "uuid"
import type { OversightRecord, ConversationSource, CodeAnchor } from "../types/index.js"

const client = new Anthropic()

// Patterns that indicate constraint-like content in comments
const CONSTRAINT_PATTERNS = [
  /\b(TODO|FIXME|HACK|XXX)\b[:\s]*(.+)/gi,
  /\b(MUST|SHOULD|SHALL|NEVER|ALWAYS)\b[^.]*\./gi,
  /@oversight\s+(must|should|avoid)[:\s]*(.+)/gi,
  /(?:decision|constraint|ADR)[-:]?\s*(.+)/gi,
  /\*\s*@(param|returns|throws)\s+\w+\s+(.+)/g,
  /\/\*\*[\s\S]*?(?:\*\/|$)/g, // JSDoc blocks
]

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])

export interface CodeSnippet {
  filePath: string
  lineStart: number
  lineEnd: number
  text: string
  kind: string
}

/**
 * Recursively collect all code files under a directory.
 */
function collectFiles(dir: string, baseDir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    const rel = relative(baseDir, full)
    if (e.isDirectory()) {
      if (!e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist") {
        collectFiles(full, baseDir, out)
      }
    } else if (e.isFile()) {
      const ext = extname(e.name)
      if (CODE_EXTENSIONS.has(ext)) {
        out.push(rel)
      }
    }
  }
}

/**
 * Extract comment snippets from a file that may contain constraints.
 */
function extractSnippetsFromFile(
  filePath: string,
  baseDir: string,
  content: string
): CodeSnippet[] {
  const snippets: CodeSnippet[] = []
  const lines = content.split("\n")
  const fullPath = join(baseDir, filePath)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    // Single-line: TODO, FIXME, MUST, SHOULD, @oversight
    if (
      /\/\/\s*(TODO|FIXME|HACK|XXX|MUST|SHOULD|@oversight)/i.test(line) ||
      /\/\/\s*.*\b(never|always)\b/i.test(line)
    ) {
      const match = line.match(/\/\/\s*(.+)/)
      if (match) {
        snippets.push({
          filePath,
          lineStart: lineNum,
          lineEnd: lineNum,
          text: match[1].trim(),
          kind: "single-line",
        })
      }
    }

    // JSDoc block
    if (line.trim().startsWith("/**")) {
      const block: string[] = []
      let j = i
      while (j < lines.length) {
        block.push(lines[j])
        if (lines[j].includes("*/")) break
        j++
      }
      const blockText = block.join("\n").replace(/^\s*\*\s?/gm, "").replace(/\/\*\*|\*\//g, "").trim()
      if (blockText.length > 20 && /MUST|SHOULD|constraint|decision|never|always|@param|@returns/i.test(blockText)) {
        snippets.push({
          filePath,
          lineStart: lineNum,
          lineEnd: j + 1,
          text: blockText,
          kind: "jsdoc",
        })
      }
    }

    // Multi-line /* */
    if (line.trim().startsWith("/*") && !line.trim().startsWith("/**")) {
      const block: string[] = []
      let j = i
      while (j < lines.length) {
        block.push(lines[j])
        if (lines[j].includes("*/")) break
        j++
      }
      const blockText = block.join("\n").replace(/\/\*|\*\//g, "").trim()
      if (blockText.length > 15) {
        snippets.push({
          filePath,
          lineStart: lineNum,
          lineEnd: j + 1,
          text: blockText,
          kind: "block",
        })
      }
    }
  }

  return snippets
}

/**
 * Scan a codebase for constraint-like comments.
 */
export function scanCodebaseForSnippets(rootDir: string, includeDirs: string[] = ["src"]): CodeSnippet[] {
  const all: CodeSnippet[] = []
  for (const dir of includeDirs) {
    const fullDir = join(rootDir, dir)
    if (!statSync(fullDir).isDirectory()) continue
    const files: string[] = []
    collectFiles(fullDir, rootDir, files)
    for (const f of files) {
      try {
        const content = readFileSync(join(rootDir, f), "utf-8")
        all.push(...extractSnippetsFromFile(f, rootDir, content))
      } catch {
        // Skip unreadable files
      }
    }
  }
  return all
}

const CODE_EXTRACT_SYSTEM = `You are an expert at identifying architectural decisions and constraints from code comments.

Given code comment snippets (from JSDoc, TODO, FIXME, @oversight markers, MUST/SHOULD phrases), extract ALL distinct decisions or constraints.

For each snippet that expresses a requirement, rule, or architectural choice:
- Create a decision with title, summary, context, decision text
- Add constraints with severity: "must" | "should" | "avoid"
- Anchors: set anchors to the file path where the comment was found (type: "file", path: the relative path)

Ignore snippets that are:
- Pure API docs with no constraint (e.g. @param without requirements)
- Trivial TODOs with no architectural meaning
- Noise or boilerplate

Return a JSON array of decisions. For each:
{
  "extractionReason": "why this was captured",
  "confidence": 0.0-1.0,
  "record": {
    "title": "short title",
    "summary": "one-liner",
    "context": "where this appears in code",
    "decision": "what was decided",
    "rationale": "why (from comment or inferred)",
    "constraints": [{"description":"...", "severity":"must|should|avoid", "rationale":"..."}],
    "anchors": [{"type":"file", "path":"relative/path/to/file.ts"}],
    "decisionType": "architectural|security|performance|compatibility|...",
    "confidence": "definitive|provisional|exploratory"
  }
}

Return ONLY valid JSON array. No markdown. Return [] if nothing extractable.`

export interface ExtractedFromCode {
  record: Omit<OversightRecord, "id" | "version" | "author" | "timestamp" | "status">
  confidence: number
  extractionReason: string
}

/**
 * Use LLM to extract OversightRecords from code comment snippets.
 */
export async function extractDecisionsFromCodeSnippets(
  snippets: CodeSnippet[],
  author: string
): Promise<OversightRecord[]> {
  if (snippets.length === 0) return []

  // Batch snippets into chunks to avoid token limits (roughly 10 snippets per batch)
  const batchSize = 10
  const batches: CodeSnippet[][] = []
  for (let i = 0; i < snippets.length; i += batchSize) {
    batches.push(snippets.slice(i, i + batchSize))
  }

  const results: OversightRecord[] = []
  const source: ConversationSource = { origin: "code-comment", excerpt: "Extracted from code comments" }

  for (const batch of batches) {
    const input = batch
      .map(
        (s) =>
          `[${s.filePath}:${s.lineStart}-${s.lineEnd}] (${s.kind})\n${s.text}`
      )
      .join("\n\n---\n\n")

    const attempt = async (userMsg: string): Promise<string> => {
      const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: CODE_EXTRACT_SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      })
      const block = response.content[0]
      if (block.type !== "text") throw new Error("Unexpected response type")
      return block.text
    }

    let raw: string
    try {
      raw = await attempt(
        `Extract architectural decisions from these code comments:\n\n${input}`
      )
    } catch (err) {
      console.warn("Extraction failed for batch:", String(err))
      continue
    }

    let parsed: ExtractedFromCode[]
    try {
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) continue
      parsed = JSON.parse(match[0]) as ExtractedFromCode[]
    } catch {
      continue
    }

    if (!Array.isArray(parsed)) continue

    for (const item of parsed) {
      if (!item.record?.title || !item.record?.decision) continue
      if (item.confidence < 0.3) continue

      const anchors: CodeAnchor[] = (item.record.anchors ?? []).length > 0
        ? (item.record.anchors as CodeAnchor[])
        : batch.length > 0
          ? [{ type: "file" as const, path: batch[0].filePath }]
          : []

      results.push({
        id: uuidv4(),
        version: 1,
        status: "active" as const,
        anchors,
        title: item.record.title,
        summary: item.record.summary ?? item.record.title,
        context: item.record.context ?? "Extracted from code comments",
        decision: item.record.decision,
        rationale: item.record.rationale ?? "",
        constraints: item.record.constraints ?? [],
        alternatives: item.record.alternatives ?? [],
        consequences: item.record.consequences ?? "",
        tags: item.record.tags ?? [],
        decisionType: item.record.decisionType ?? "architectural",
        confidence: item.record.confidence ?? "provisional",
        author,
        timestamp: new Date().toISOString(),
        agentHints: item.record.agentHints ?? [],
        doNotChange: item.record.doNotChange ?? [],
        reviewTriggers: item.record.reviewTriggers ?? [],
        source: { ...source, excerpt: item.extractionReason },
      })
    }
  }

  return results
}

/**
 * Heuristic extraction without LLM: turn snippets with MUST/SHOULD/NEVER/ALWAYS into minimal records.
 */
export function heuristicExtractFromSnippets(
  snippets: CodeSnippet[],
  author: string
): OversightRecord[] {
  const results: OversightRecord[] = []
  const constraintRegex = /\b(MUST|SHOULD|NEVER|ALWAYS|avoid)\b[^.]*\.?/gi

  for (const s of snippets) {
    const matches = s.text.match(constraintRegex)
    if (!matches || matches.length === 0) continue

    const severity = /\b(MUST|NEVER|ALWAYS)\b/i.test(s.text) ? "must" : "should"
    const constraints = matches.slice(0, 3).map((m) => ({
      description: m.trim(),
      severity: "must" as const,
      rationale: "Extracted from code comment",
    }))

    if (constraints.length === 0) continue

    results.push({
      id: uuidv4(),
      version: 1,
      status: "active",
      anchors: [{ type: "file", path: s.filePath }],
      title: `Constraint from ${s.filePath}:${s.lineStart}`,
      summary: constraints[0].description.slice(0, 80) + (constraints[0].description.length > 80 ? "…" : ""),
      context: `Found in ${s.filePath} lines ${s.lineStart}-${s.lineEnd} (${s.kind})`,
      decision: constraints.map((c) => c.description).join(" "),
      rationale: "Heuristic extraction from code comment",
      constraints,
      alternatives: [],
      consequences: "",
      tags: ["code-scan"],
      decisionType: "architectural",
      confidence: "provisional",
      author,
      timestamp: new Date().toISOString(),
      agentHints: [],
      doNotChange: [],
      reviewTriggers: [],
      source: { origin: "code-comment", excerpt: s.text.slice(0, 200) },
    })
  }

  return results
}
