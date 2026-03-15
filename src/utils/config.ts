import fs from "fs"
import path from "path"
import type { OversightConfig } from "../types/index.js"

export function findOversightDir(startDir: string = process.cwd()): string | null {
  let current = startDir
  while (true) {
    const candidate = path.join(current, ".oversight")
    if (fs.existsSync(path.join(candidate, "config.json"))) {
      return candidate
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export function readConfig(startDir: string = process.cwd()): OversightConfig {
  const oversightDir = findOversightDir(startDir)
  if (!oversightDir) {
    throw new Error("Oversight not initialized. Run `oversight init` first.")
  }
  const raw = fs.readFileSync(path.join(oversightDir, "config.json"), "utf-8")
  return JSON.parse(raw) as OversightConfig
}

export function writeConfig(config: OversightConfig, targetDir: string = process.cwd()): void {
  const oversightDir = path.join(targetDir, ".oversight")
  fs.mkdirSync(oversightDir, { recursive: true })
  fs.writeFileSync(path.join(oversightDir, "config.json"), JSON.stringify(config, null, 2), "utf-8")
}

export function getOversightDir(startDir: string = process.cwd()): string {
  const dir = findOversightDir(startDir)
  if (!dir) {
    throw new Error("Oversight not initialized. Run `oversight init` first.")
  }
  return dir
}

export function getDbPath(startDir: string = process.cwd()): string {
  return path.join(getOversightDir(startDir), "decisions.db")
}
