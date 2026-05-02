import "dotenv/config"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

interface D1Database {
  database_name?: string
}

interface WranglerConfig {
  d1_databases?: D1Database[]
}

function runWrangler(args: string[], options: { capture?: boolean } = {}) {
  if (options.capture) {
    return execFileSync("pnpm", ["exec", "wrangler", ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  }

  return execFileSync("pnpm", ["exec", "wrangler", ...args], {
    encoding: "utf-8",
    stdio: "inherit",
  })
}

function readDatabaseName() {
  const wranglerPath = resolve("wrangler.json")
  const config = JSON.parse(readFileSync(wranglerPath, "utf-8")) as WranglerConfig
  const databaseName = config.d1_databases?.[0]?.database_name

  if (!databaseName) {
    throw new Error("Database name not found in wrangler.json")
  }

  return databaseName
}

function getPendingMigrations(databaseName: string) {
  const output = runWrangler(["d1", "migrations", "list", databaseName, "--remote"], {
    capture: true,
  })

  return [...output.matchAll(/│\s*([0-9][^│]+\.sql)\s*│/g)].map(match => match[1].trim())
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-")
}

function backupRemoteDatabase(databaseName: string) {
  mkdirSync(resolve("backups"), { recursive: true })
  const safeName = databaseName.replace(/[^a-zA-Z0-9_.-]/g, "-")
  const output = resolve("backups", `d1-${safeName}-pre-migrate-${timestamp()}.sql`)

  console.log(`🧰 Exporting remote D1 backup to ${output}`)
  runWrangler(["d1", "export", databaseName, "--remote", "--output", output])

  return output
}

function main() {
  const databaseName = readDatabaseName()
  const pending = getPendingMigrations(databaseName)

  if (pending.length === 0) {
    console.log("✅ No pending remote D1 migrations.")
    return
  }

  console.log(`📝 Pending remote D1 migrations: ${pending.join(", ")}`)
  backupRemoteDatabase(databaseName)
  runWrangler(["d1", "migrations", "apply", databaseName, "--remote"])
}

main()
