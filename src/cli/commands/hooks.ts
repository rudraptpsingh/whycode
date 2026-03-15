import { Command } from "commander"
import {
  installHooks,
  installEnforceHook,
  uninstallHooks,
  uninstallEnforceHook,
} from "../../git/hooks.js"
import { logger } from "../../utils/logger.js"

export function registerHooks(program: Command): void {
  const hooks = program.command("hooks").description("Manage git hooks")

  hooks
    .command("install")
    .description("Install Oversight git hooks")
    .option("--enforce", "Also install pre-commit hook that blocks on constraint violations")
    .action(async (opts: { enforce?: boolean }) => {
      try {
        installHooks(process.cwd())
        logger.success("Post-commit hook installed (reminds you to check decisions).")
        if (opts.enforce) {
          installEnforceHook(process.cwd())
          logger.success("Pre-commit enforcement hook installed.")
          logger.info("Run 'oversight enforce on' to enable blocking.")
        }
      } catch (err) {
        logger.error(`Failed to install hook: ${String(err)}`)
      }
    })

  hooks
    .command("uninstall")
    .description("Remove Oversight git hooks")
    .option("--enforce", "Also remove pre-commit enforcement hook")
    .action(async (opts: { enforce?: boolean }) => {
      try {
        uninstallHooks(process.cwd())
        logger.success("Post-commit hook removed.")
        if (opts.enforce) {
          uninstallEnforceHook(process.cwd())
          logger.success("Pre-commit enforcement hook removed.")
        }
      } catch (err) {
        logger.error(`Failed to remove hook: ${String(err)}`)
      }
    })
}
