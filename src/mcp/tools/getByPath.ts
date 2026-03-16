import type { Database } from "../../db/adapter.js"
import { getDecisionsByPath } from "../../db/decisions.js"
import type { OversightRecord } from "../../types/index.js"

export const getByPathTool = {
  name: "oversight_get_by_path",
  description:
    "Retrieve Oversight decisions for file path(s). Call ONCE with all paths you plan to edit (paths: ['a.ts','b.ts']) to avoid extra roundtrips.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "Single path (legacy)" },
      paths: { type: "array", items: { type: "string" }, description: "Multiple paths — preferred: batch all paths in one call" },
      includeSuperseded: { type: "boolean", description: "Include superseded decisions (default false)" },
    },
    required: [],
  },
}

export function handleGetByPath(
  db: Database,
  input: { path?: string; paths?: string[]; includeSuperseded?: boolean }
): OversightRecord[] {
  const pathsRaw = input.paths
  const single = input.path != null ? input.path : ""
  const paths: string[] =
    Array.isArray(pathsRaw) && pathsRaw.length > 0 ? pathsRaw : single ? [single] : []
  const seen = new Set<string>()
  const unique: OversightRecord[] = []
  for (const p of paths) {
    const basename = p.split("/").pop() ?? p
    const records = getDecisionsByPath(db, p)
    const extra = basename !== p ? getDecisionsByPath(db, basename) : []
    for (const r of [...records, ...extra]) {
      if (!seen.has(r.id)) {
        seen.add(r.id)
        unique.push(r)
      }
    }
  }
  if (!input.includeSuperseded) {
    return unique.filter((r) => r.status === "active" || r.status === "proposed")
  }
  return unique
}
