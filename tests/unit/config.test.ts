import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { writeConfig, readConfig, getDbPath, findOversightDir } from "../../src/utils/config.js"

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oversight-config-test-"))
}

describe("config utilities", () => {
  let tmpdir: string

  beforeEach(() => { tmpdir = tmpDir() })
  afterEach(() => { fs.rmSync(tmpdir, { recursive: true, force: true }) })

  it("writes and reads config", () => {
    const config = { version: "1.0.0", author: "Alice", repoRoot: tmpdir, createdAt: new Date().toISOString() }
    writeConfig(config, tmpdir)
    const read = readConfig(tmpdir)
    expect(read.author).toBe("Alice")
    expect(read.version).toBe("1.0.0")
  })

  it("throws when no config exists", () => {
    expect(() => readConfig(tmpdir)).toThrow("Oversight not initialized")
  })

  it("getDbPath returns correct path", () => {
    writeConfig({ version: "1.0.0", author: "Bob", repoRoot: tmpdir, createdAt: new Date().toISOString() }, tmpdir)
    const dbPath = getDbPath(tmpdir)
    expect(dbPath).toContain("decisions.db")
    expect(dbPath).toContain(".oversight")
  })

  it("findOversightDir walks up the tree", () => {
    writeConfig({ version: "1.0.0", author: "Carol", repoRoot: tmpdir, createdAt: new Date().toISOString() }, tmpdir)
    const nestedDir = path.join(tmpdir, "src", "deep", "nested")
    fs.mkdirSync(nestedDir, { recursive: true })
    const found = findOversightDir(nestedDir)
    expect(found).toBe(path.join(tmpdir, ".oversight"))
  })
})
