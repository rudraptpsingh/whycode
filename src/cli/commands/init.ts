import { Command } from "commander"
import inquirer from "inquirer"
import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { writeConfig, findOversightDir } from "../../utils/config.js"
import { initDb } from "../../db/schema.js"
import { logger } from "../../utils/logger.js"

function getGitAuthor(): string {
  try {
    return execSync("git config user.name", { encoding: "utf-8" }).trim()
  } catch {
    return ""
  }
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize Oversight in the current repository")
    .action(async () => {
      const cwd = process.cwd()
      const existing = findOversightDir(cwd)
      const isReinit = existing === path.join(cwd, ".oversight")

      if (isReinit) {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Oversight is already initialized. Reinitialize?",
            default: false,
          },
        ])
        if (!confirm) {
          logger.info("Aborted.")
          return
        }
      }

      const defaultAuthor = getGitAuthor()
      const { author } = await inquirer.prompt([
        {
          type: "input",
          name: "author",
          message: "Author name:",
          default: defaultAuthor,
          validate: (v: string) => v.trim().length > 0 || "Author name is required",
        },
      ])

      const oversightDir = path.join(cwd, ".oversight")
      fs.mkdirSync(oversightDir, { recursive: true })

      writeConfig(
        {
          version: "1.0.0",
          author: author.trim(),
          repoRoot: cwd,
          createdAt: new Date().toISOString(),
        },
        cwd
      )

      initDb(oversightDir)

      fs.writeFileSync(
        path.join(oversightDir, ".gitignore"),
        "decisions.db-journal\ndecisions.db-shm\ndecisions.db-wal\n",
        "utf-8"
      )

      logger.success("Oversight initialized successfully!")
      console.log("")
      logger.info("Next steps:")
      console.log("  • oversight capture          — record a decision")
      console.log("  • oversight list             — view all decisions")
      console.log("  • oversight check <path>     — check decisions for a file")
      console.log("  • oversight hooks install    — enable git post-commit reminders")
      console.log("")
    })
}
