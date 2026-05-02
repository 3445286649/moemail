import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

interface OtpUserStateRow {
  version?: number | null
  total?: number | null
  message_count?: number | null
  code_count?: number | null
  received_count?: number | null
  empty_count?: number | null
  used_count?: number | null
  latest_received_at?: number | null
}

function toSummary(row?: OtpUserStateRow | null) {
  const latestReceivedAt = Number(row?.latest_received_at || 0) || null
  return {
    version: Number(row?.version || 0),
    total: Number(row?.total || 0),
    messageCount: Number(row?.message_count || 0),
    codeCount: Number(row?.code_count || 0),
    receivedCount: Number(row?.received_count || 0),
    emptyCount: Number(row?.empty_count || 0),
    usedCount: Number(row?.used_count || 0),
    latestReceivedAt,
    statusCounts: {
      all: Number(row?.total || 0),
      new: Number(row?.received_count || 0),
      code: Number(row?.code_count || 0),
      empty: Number(row?.empty_count || 0),
      used: Number(row?.used_count || 0),
    },
  }
}

async function ensureState(env: ReturnType<typeof getRequestContext>["env"], userId: string) {
  const existing = await env.DB.prepare(`
    SELECT
      version,
      total,
      message_count,
      code_count,
      received_count,
      empty_count,
      used_count,
      latest_received_at
    FROM otp_user_state
    WHERE user_id = ?
  `).bind(userId).first<OtpUserStateRow>()

  if (existing) return existing

  const now = Date.now()
  await env.DB.prepare(`
    INSERT OR REPLACE INTO otp_user_state (
      user_id,
      version,
      total,
      message_count,
      code_count,
      received_count,
      empty_count,
      used_count,
      latest_received_at,
      updated_at
    )
    SELECT
      ?,
      COALESCE(MAX(COALESCE(updated_at, latest_received_at, created_at, 0)), 0),
      COUNT(*),
      COALESCE(SUM(COALESCE(message_count, 0)), 0),
      COALESCE(SUM(CASE WHEN latest_code IS NOT NULL AND latest_code != '' THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN latest_received_at IS NOT NULL THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN COALESCE(message_count, 0) = 0 THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN COALESCE(used, 0) = 1 THEN 1 ELSE 0 END), 0),
      MAX(latest_received_at),
      ?
    FROM email
    WHERE userId = ?
      AND expires_at > ?
  `).bind(userId, now, userId, now).run()

  return env.DB.prepare(`
    SELECT
      version,
      total,
      message_count,
      code_count,
      received_count,
      empty_count,
      used_count,
      latest_received_at
    FROM otp_user_state
    WHERE user_id = ?
  `).bind(userId).first<OtpUserStateRow>()
}

export async function GET(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const after = Number(searchParams.get("after") || 0)
  const env = getRequestContext().env
  const summary = toSummary(await ensureState(env, userId))

  return NextResponse.json({
    changed: summary.version > after,
    ...summary,
  })
}
