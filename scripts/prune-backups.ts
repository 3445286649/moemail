import { readdirSync, rmSync, statSync } from "node:fs"
import { basename, resolve } from "node:path"

const keep = Math.max(1, Number(process.env.MOEMAIL_BACKUP_KEEP || 10))
const backupsDir = resolve(process.env.MOEMAIL_BACKUP_DIR || "backups")
const cwd = resolve(".")

if (!backupsDir.startsWith(`${cwd}/`) && backupsDir !== resolve(cwd, "backups")) {
  throw new Error(`Refusing to prune backups outside this workspace: ${backupsDir}`)
}

let entries: Array<{ path: string; name: string; mtimeMs: number }> = []

try {
  entries = readdirSync(backupsDir)
    .filter(name => /\.(sql|tar\.gz|tgz|zip)$/i.test(name))
    .map(name => {
      const path = resolve(backupsDir, name)
      const stat = statSync(path)
      return { path, name, mtimeMs: stat.mtimeMs }
    })
    .filter(entry => statSync(entry.path).isFile())
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`✅ No backup directory found at ${backupsDir}; nothing to prune.`)
    process.exit(0)
  }
  throw error
}

const stale = entries.slice(keep)

for (const entry of stale) {
  rmSync(entry.path, { force: true })
}

console.log(`✅ Backup retention complete: kept ${Math.min(entries.length, keep)}, removed ${stale.length}.`)
if (stale.length) {
  console.log(`🧹 Removed: ${stale.map(entry => basename(entry.name)).join(", ")}`)
}
