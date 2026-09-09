#!/usr/bin/env node
/**
 * Prints the docker compose command line for one stand — never runs it.
 * This package prepares the deploy; nothing here executes docker or ssh
 * (order t-2026-09-09-02, point 2: "those happen in wave 3 on Ivan's
 * order").
 *
 * Usage:
 *   node deploy/scripts/render-stand.mjs <stand> [up|config|build]
 *
 *   <stand>  one of kerbstone, ferrite, scruple, larchant, long-morning
 *   action   defaults to "up" (adds -d --build); "config" and "build" print
 *            the same base command with a different subcommand
 *
 * Reads deploy/stands/<stand>.env if it exists (real, gitignored — see
 * deploy/.gitignore added by this package), falling back to
 * deploy/stands/<stand>.env.example so this script also works before a real
 * env file has been created — it never opens either file's contents itself,
 * only checks which one exists, so it prints no secret regardless.
 */
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const DEPLOY_ROOT = resolve(HERE, "..")
const STANDS = ["kerbstone", "ferrite", "scruple", "larchant", "long-morning"]

function main(argv) {
  const [stand, action = "up"] = argv
  if (!stand || !STANDS.includes(stand)) {
    console.error(`Usage: node render-stand.mjs <${STANDS.join("|")}> [up|config|build]`)
    process.exit(1)
  }

  const realEnv = join(DEPLOY_ROOT, "stands", `${stand}.env`)
  const exampleEnv = join(DEPLOY_ROOT, "stands", `${stand}.env.example`)
  const envFile = existsSync(realEnv) ? realEnv : exampleEnv
  if (envFile === exampleEnv) {
    console.error(
      `# Note: deploy/stands/${stand}.env does not exist yet, printed with the .example ` +
        `file instead. Copy it, fill in every blank (secrets, MEDUSA_PUBLISHABLE_KEY after ` +
        "the backend's first seed), then re-run this script."
    )
  }

  const composeFile = join(DEPLOY_ROOT, "compose.stand.yml")
  const base = [
    "docker",
    "compose",
    "-p",
    stand,
    "-f",
    composeFile,
    "--env-file",
    envFile,
  ]

  const subcommand =
    action === "config"
      ? ["config"]
      : action === "build"
        ? ["build"]
        : action === "up"
          ? ["up", "-d", "--build"]
          : (() => {
              console.error(`Unknown action "${action}". Use up, config or build.`)
              process.exit(1)
            })()

  console.log([...base, ...subcommand].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" "))
}

main(process.argv.slice(2))
