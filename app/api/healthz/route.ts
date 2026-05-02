import { NextResponse } from "next/server"
import packageJson from "../../../package.json"

export const runtime = "edge"

function firstValue(...values: Array<string | undefined>) {
  return values.find(value => value && value.trim().length > 0) || null
}

function shortCommit(value: string | null) {
  return value ? value.slice(0, 12) : null
}

export async function GET() {
  const commit = firstValue(
    process.env.MOEMAIL_COMMIT_SHA,
    process.env.CF_PAGES_COMMIT_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA
  )
  const branch = firstValue(
    process.env.MOEMAIL_DEPLOY_BRANCH,
    process.env.CF_PAGES_BRANCH,
    process.env.VERCEL_GIT_COMMIT_REF
  )

  return NextResponse.json(
    {
      status: "ok",
      service: packageJson.name,
      version: `v${packageJson.version}`,
      commit: shortCommit(commit),
      branch,
      runtime: "edge",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}
