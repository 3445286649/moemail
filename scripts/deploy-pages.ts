import "dotenv/config"
import { execFileSync } from "node:child_process"

function gitValue(args: string[], fallback: string) {
  try {
    return execFileSync("git", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || fallback
  } catch {
    return fallback
  }
}

function gitDirty() {
  return gitValue(["status", "--porcelain"], "").length > 0
}

function gitHasCommit(commit: string) {
  if (commit === "unknown") return false

  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
      stdio: "ignore",
    })
    return true
  } catch {
    return false
  }
}

const commit = process.env.MOEMAIL_COMMIT_SHA || gitValue(["rev-parse", "HEAD"], "unknown")
const branch = process.env.MOEMAIL_DEPLOY_BRANCH || "main"
const dirty = process.env.MOEMAIL_DIRTY || String(gitDirty())

const env = {
  ...process.env,
  MOEMAIL_COMMIT_SHA: commit,
  MOEMAIL_DEPLOY_BRANCH: branch,
  MOEMAIL_DIRTY: dirty,
}

execFileSync("pnpm", ["run", "build:pages"], {
  env,
  stdio: "inherit",
})

const deployArgs = [
  "exec",
  "wrangler",
  "pages",
  "deploy",
  ".vercel/output/static",
  "--branch",
  branch,
  "--no-bundle",
  "--commit-dirty=true",
]

if (gitHasCommit(commit)) {
  deployArgs.push("--commit-hash", commit)
}

execFileSync("pnpm", deployArgs, {
  env,
  stdio: "inherit",
})
