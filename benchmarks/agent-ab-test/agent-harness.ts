/**
 * Agent harness — LLM loop with tool use for building the Auth + Rate-Limit API.
 * Supports Agent A (no Oversight) and Agent B (with Oversight via prompt injection).
 * Uses OPENAI_API_KEY or ANTHROPIC_API_KEY (OpenAI preferred when both set).
 */
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import type { Database } from "../../src/db/adapter"
import { TASK_PROMPT } from "./task.js"
import { BASE_RECORDS } from "./constraints/base.js"
import { INJECTED_RECORDS } from "./constraints/injected.js"
import { insertDecision } from "../../src/db/decisions.js"
import { handleRecord } from "../../src/mcp/tools/record.js"
import { handleGetByPath } from "../../src/mcp/tools/getByPath.js"
import type { OversightRecord } from "../../src/types/index.js"

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
const OPENAI_MODEL = "gpt-4o-mini"
const MAX_TURNS = 25

export type Scenario = "B1" | "B2" | "B3" | "B4"

export interface HarnessOptions {
  workDir: string
  scenario: Scenario
  db: Database | null
  useOversight: boolean
  injectAtTurn?: number
  maxTurns?: number
}

export interface RunResult {
  success: boolean
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  oversightCalls: number
  wallTimeMs: number
  files: Record<string, string>
  finalMessage?: string
  error?: string
}

const TOOLS_ANTHROPIC = [
  { name: "write_file", description: "Write or overwrite a file. Create directories as needed.", input_schema: { type: "object" as const, properties: { path: { type: "string", description: "Relative path from work dir" }, content: { type: "string", description: "Full file content" } }, required: ["path", "content"] } },
  { name: "read_file", description: "Read a file's contents.", input_schema: { type: "object" as const, properties: { path: { type: "string", description: "Relative path from work dir" } }, required: ["path"] } },
  { name: "run_terminal_cmd", description: "Run a shell command in the work directory.", input_schema: { type: "object" as const, properties: { command: { type: "string", description: "Shell command to run" } }, required: ["command"] } },
  { name: "list_dir", description: "List files and directories.", input_schema: { type: "object" as const, properties: { path: { type: "string", description: "Relative path, default ''" } }, required: [] } },
]

const TOOLS_OPENAI: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  { type: "function", function: { name: "write_file", description: "Write or overwrite a file. Create directories as needed.", parameters: { type: "object", properties: { path: { type: "string", description: "Relative path from work dir" }, content: { type: "string", description: "Full file content" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "read_file", description: "Read a file's contents.", parameters: { type: "object", properties: { path: { type: "string", description: "Relative path from work dir" } }, required: ["path"] } } },
  { type: "function", function: { name: "run_terminal_cmd", description: "Run a shell command in the work directory.", parameters: { type: "object", properties: { command: { type: "string", description: "Shell command to run" } }, required: ["command"] } } },
  { type: "function", function: { name: "list_dir", description: "List files and directories.", parameters: { type: "object", properties: { path: { type: "string", description: "Relative path, default ''" } }, required: [] } } },
]

const GET_BY_PATH_TOOL_ANTHROPIC = {
  name: "oversight_get_by_path",
  description: "Get Oversight decisions for file(s). Call ONCE with all paths you plan to edit (e.g. paths: ['auth.ts','rate-limiter.ts']) before editing. Required when Oversight is enabled.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "Single path (legacy)" },
      paths: { type: "array", items: { type: "string" }, description: "Multiple paths — preferred: batch all auth/rate paths in one call" },
    },
    required: [],
  },
}

const GET_BY_PATH_TOOL_OPENAI: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "oversight_get_by_path",
    description: "Get Oversight decisions for file(s). Call ONCE with all paths you plan to edit (e.g. paths: ['auth.ts','rate-limiter.ts']) before editing. Required when Oversight is enabled.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Single path (legacy)" },
        paths: { type: "array", items: { type: "string" }, description: "Multiple paths — preferred: batch all auth/rate paths in one call" },
      },
    },
  },
}

const RECORD_TOOL_ANTHROPIC = {
  name: "oversight_record",
  description: "Record an architectural decision. Use for non-obvious choices (JWT verify vs decode, rate limit key). Anchors: [{type:'file',path:'auth.ts'}]. Constraints: [{description:'MUST...',severity:'must',rationale:'...'}]",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      decision: { type: "string" },
      context: { type: "string" },
      rationale: { type: "string" },
      anchors: { type: "array", items: { type: "object" } },
      constraints: { type: "array", items: { type: "object" } },
    },
    required: ["title", "summary", "decision", "context"],
  },
}

const RECORD_TOOL_OPENAI: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "oversight_record",
    description: "Record an architectural decision you are making. Use when you make a non-obvious choice (e.g. JWT verify vs decode, rate limit key structure). Record BEFORE or when editing auth/rate-limit files.",
    parameters: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, decision: { type: "string" }, context: { type: "string" }, rationale: { type: "string" }, anchors: { type: "array", items: { type: "object", properties: { type: { type: "string" }, path: { type: "string" } } } }, constraints: { type: "array", items: { type: "object", properties: { description: { type: "string" }, severity: { type: "string" }, rationale: { type: "string" } } } } }, required: ["title", "summary", "decision", "context"] },
  },
}

/** Compact format to curb token growth (~112 tokens vs ~418 for full format). */
function formatOversightContext(records: OversightRecord[]): string {
  if (records.length === 0) return ""
  const lines = records.flatMap((r) =>
    r.constraints.map((c) => `- [${c.severity.toUpperCase()}] ${c.description}`)
  )
  return "OVERSIGHT (respect all):\n" + lines.join("\n")
}

export async function runAgent(opts: HarnessOptions): Promise<RunResult> {
  const { workDir, scenario, db, useOversight, injectAtTurn = 12, maxTurns = MAX_TURNS } = opts
  const files: Record<string, string> = {}
  let oversightCalls = 0
  const startTime = Date.now()

  mkdirSync(workDir, { recursive: true })

  // Seed DB for B3, B4
  if (db && (scenario === "B3" || scenario === "B4")) {
    for (const r of BASE_RECORDS) {
      insertDecision(db, r)
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const useOpenAI = !!openaiKey

  if (!openaiKey && !anthropicKey) {
    return {
      success: false,
      turns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      oversightCalls: 0,
      wallTimeMs: Date.now() - startTime,
      files,
      error: "OPENAI_API_KEY or ANTHROPIC_API_KEY required. Set one to run the benchmark.",
    }
  }

  const systemBase = `You are an expert TypeScript/Node.js developer. Build the requested API in the workspace.
When done, reply with "DONE" and a brief summary. Use the tools to create and edit files.`

  const oversightQueryRule = `
OVERSIGHT IS ENABLED. Before editing auth.ts, auth-middleware.ts, rate-limiter.ts, or rateLimit.ts: call oversight_get_by_path ONCE with paths: ["auth.ts","auth-middleware.ts","rate-limiter.ts","rateLimit.ts"] (or the actual paths you will create). Batch all paths in a single call. Respect every MUST constraint returned.`

  const systemB1 =
    systemBase +
    oversightQueryRule +
    `

You also have oversight_record. When you make architectural decisions (e.g. "use jwt.verify not decode"), record them with oversight_record BEFORE editing. Then future oversight_get_by_path calls will return your decisions.`

  const systemWithOversight = useOversight
    ? scenario === "B1"
      ? systemB1
      : systemBase + oversightQueryRule
    : systemBase

  const toolsAnthropic =
    db && useOversight
      ? scenario === "B1"
        ? [...TOOLS_ANTHROPIC, GET_BY_PATH_TOOL_ANTHROPIC, RECORD_TOOL_ANTHROPIC]
        : [...TOOLS_ANTHROPIC, GET_BY_PATH_TOOL_ANTHROPIC]
      : TOOLS_ANTHROPIC
  const toolsOpenAI =
    db && useOversight
      ? scenario === "B1"
        ? [...TOOLS_OPENAI, GET_BY_PATH_TOOL_OPENAI, RECORD_TOOL_OPENAI]
        : [...TOOLS_OPENAI, GET_BY_PATH_TOOL_OPENAI]
      : TOOLS_OPENAI

  const messages: Array<{ role: "user" | "assistant"; content: string | unknown[] }> = [{ role: "user", content: TASK_PROMPT }]

  type OpenAIMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam
  const openaiMessages: OpenAIMsg[] = [
    { role: "system", content: systemWithOversight },
    { role: "user", content: TASK_PROMPT },
  ]

  let turns = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let finalMessage = ""

  while (turns < maxTurns) {
    turns++

    // Inject constraints mid-build for B2, B4
    if (db && useOversight && turns === injectAtTurn && (scenario === "B2" || scenario === "B4")) {
      for (const r of INJECTED_RECORDS) {
        insertDecision(db, r)
      }
    }

    // Agent gets oversight via oversight_get_by_path tool calls (query by default), not auto-inject

    async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
      try {
        if (name === "write_file") {
          const p = String(input.path ?? "")
          const c = String(input.content ?? "")
          const fullPath = join(workDir, p)
          mkdirSync(join(fullPath, ".."), { recursive: true })
          writeFileSync(fullPath, c, "utf-8")
          files[p] = c
          return `Wrote ${p} (${c.length} bytes)`
        }
        if (name === "read_file") {
          const p = String(input.path ?? "")
          const fullPath = join(workDir, p)
          if (existsSync(fullPath)) {
            const c = readFileSync(fullPath, "utf-8")
            files[p] = c
            return c
          }
          return `Error: file not found: ${p}`
        }
        if (name === "run_terminal_cmd") {
          const cmd = String(input.command ?? "")
          try {
            return execSync(cmd, { cwd: workDir, encoding: "utf-8", timeout: 30000 })
          } catch (e: unknown) {
            const err = e as { stdout?: string; stderr?: string }
            return `Error: ${(err as Error).message}\n${err.stderr ?? ""}\n${err.stdout ?? ""}`.trim()
          }
        }
        if (name === "list_dir") {
          const p = String(input.path ?? ".")
          const fullPath = join(workDir, p)
          if (existsSync(fullPath)) {
            const { readdirSync } = await import("fs")
            const entries = readdirSync(fullPath, { withFileTypes: true })
            return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join("\n")
          }
          return `Error: path not found: ${p}`
        }
        if (name === "oversight_get_by_path" && db) {
          const pathsRaw = input.paths as string[] | undefined
          const singlePath = input.path != null ? String(input.path) : ""
          const pathsToFetch = Array.isArray(pathsRaw) && pathsRaw.length > 0
            ? pathsRaw.map((p) => String(p))
            : singlePath
              ? [singlePath]
              : []
          const seen = new Set<string>()
          const unique: OversightRecord[] = []
          for (const p of pathsToFetch) {
            const basename = p.split("/").pop() ?? p
            const records = [...handleGetByPath(db, { path: p })]
            if (basename !== p) records.push(...handleGetByPath(db, { path: basename }))
            for (const r of records) {
              if (!seen.has(r.id)) {
                seen.add(r.id)
                unique.push(r)
              }
            }
          }
          oversightCalls++
          if (unique.length === 0) return "No decisions for these paths. You may proceed."
          return formatOversightContext(unique)
        }
        if (name === "oversight_record" && db) {
          const anchors = (input.anchors as Array<{ type?: string; path?: string }>) ?? []
          const constraints = (input.constraints as Array<{ description?: string; severity?: string; rationale?: string }>) ?? []
          const result = handleRecord(db, {
            title: String(input.title ?? ""),
            summary: String(input.summary ?? ""),
            decision: String(input.decision ?? ""),
            context: String(input.context ?? ""),
            rationale: input.rationale != null ? String(input.rationale) : undefined,
            anchors: anchors.map((a) => ({ type: (a.type ?? "file") as "file", path: String(a.path ?? "") })),
            constraints: constraints.map((c) => ({ description: String(c.description ?? ""), severity: (c.severity ?? "must") as "must", rationale: String(c.rationale ?? "") })),
          })
          oversightCalls++
          return JSON.stringify({ action: result.action, id: result.id, duplicateWarning: result.duplicateWarning })
        }
      } catch (e) {
        return `Error: ${(e as Error).message}`
      }
      return "Unknown tool"
    }

    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = []

    if (useOpenAI) {
      const openai = new OpenAI({ apiKey: openaiKey })
      const res = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 4096,
        messages: openaiMessages,
        tools: toolsOpenAI,
        tool_choice: "auto",
      })
      const choice = res.choices[0]
      if (!choice?.message) throw new Error("No response from OpenAI")
      const msg = choice.message
      totalInputTokens += res.usage?.prompt_tokens ?? 0
      totalOutputTokens += res.usage?.completion_tokens ?? 0

      if (msg.content) {
        finalMessage = typeof msg.content === "string" ? msg.content : msg.content.map((c) => (c as { text?: string }).text ?? "").join("")
        if (finalMessage.toUpperCase().includes("DONE")) {
          messages.push({ role: "assistant", content: finalMessage })
          break
        }
      }

      if (msg.tool_calls?.length) {
        openaiMessages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls })
        const results = await Promise.all(
          msg.tool_calls.map(async (tc) => {
            const fn = tc.function
            const input = JSON.parse(fn.arguments || "{}") as Record<string, unknown>
            const result = await executeTool(fn.name, input)
            return { tool_use_id: tc.id, content: result }
          })
        )
        for (const { tool_use_id, content } of results) {
          toolResults.push({ type: "tool_result", tool_use_id, content } as { type: "tool_result"; tool_use_id: string; content: string })
          openaiMessages.push({ role: "tool", tool_call_id: tool_use_id, content })
        }
      } else {
        messages.push({ role: "assistant", content: msg.content ?? "" })
        break
      }
    } else {
      const anthropic = new Anthropic({ apiKey: anthropicKey! })
      const res = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: systemWithOversight,
        messages,
        tools: toolsAnthropic,
        tool_choice: { type: "auto" },
      })
      totalInputTokens += res.usage.input_tokens
      totalOutputTokens += res.usage.output_tokens

      const assistantContent: unknown[] = []
      const toolUseBlocks: Array<{ id: string; name: string; input: unknown }> = []
      for (const block of res.content) {
        if (block.type === "text") {
          assistantContent.push({ type: "text", text: block.text })
          finalMessage = block.text
        }
        if (block.type === "tool_use") {
          assistantContent.push({ type: "tool_use", id: block.id, name: block.name, input: block.input })
          toolUseBlocks.push({ id: block.id, name: block.name, input: block.input })
        }
      }
      const anthResults = await Promise.all(
        toolUseBlocks.map(async (tb) => ({
          id: tb.id,
          content: await executeTool(tb.name, tb.input as Record<string, unknown>),
        }))
      )
      for (const { id, content } of anthResults) {
        toolResults.push({ type: "tool_result", tool_use_id: id, content } as { type: "tool_result"; tool_use_id: string; content: string })
      }
      messages.push({ role: "assistant", content: assistantContent })
    }

    if (toolResults.length === 0) break

    messages.push({ role: "user", content: toolResults })
    if (finalMessage.toUpperCase().includes("DONE")) break
  }

  return {
    success: finalMessage.toUpperCase().includes("DONE"),
    turns,
    totalInputTokens,
    totalOutputTokens,
    oversightCalls,
    wallTimeMs: Date.now() - startTime,
    files,
    finalMessage,
  }
}
