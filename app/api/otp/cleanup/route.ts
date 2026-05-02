import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

type CleanupMode = "test" | "empty" | "olderThan"

interface CleanupBody {
  mode?: CleanupMode
  days?: number
  confirm?: boolean
}

function buildCleanupWhere(mode: CleanupMode, days: number) {
  const now = Date.now()
  if (mode === "test") {
    return {
      where: `e.userId = ? AND (
        LOWER(e.address) LIKE 'graytest%'
        OR LOWER(e.address) LIKE 'tailtest%'
        OR LOWER(e.address) LIKE 'finaltest%'
        OR LOWER(e.address) LIKE 'routetest%'
        OR LOWER(e.address) LIKE 'uitest%'
        OR LOWER(e.address) LIKE 'smtptest%'
        OR LOWER(e.address) LIKE 'nulltest%'
        OR LOWER(e.address) LIKE 'test%'
      )`,
      extra: [] as Array<string | number>,
    }
  }

  if (mode === "empty") {
    return {
      where: `e.userId = ? AND NOT EXISTS (SELECT 1 FROM message m WHERE m.emailId = e.id)`,
      extra: [] as Array<string | number>,
    }
  }

  const safeDays = Math.min(Math.max(days || 7, 1), 365)
  return {
    where: `e.userId = ? AND e.created_at < ? AND NOT EXISTS (SELECT 1 FROM message m WHERE m.emailId = e.id AND m.received_at >= ?)`,
    extra: [now - safeDays * 24 * 60 * 60 * 1000, now - safeDays * 24 * 60 * 60 * 1000] as Array<string | number>,
  }
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as CleanupBody
  const mode = body.mode || "test"
  if (!["test", "empty", "olderThan"].includes(mode)) {
    return NextResponse.json({ error: "无效的清理模式" }, { status: 400 })
  }

  const env = getRequestContext().env
  const { where, extra } = buildCleanupWhere(mode as CleanupMode, Number(body.days || 7))
  const bindings = [userId, ...extra]
  const preview = await env.DB.prepare(`
    SELECT
      e.id,
      e.address,
      e.created_at,
      (SELECT COUNT(*) FROM message m WHERE m.emailId = e.id) AS message_count,
      (SELECT MAX(m.received_at) FROM message m WHERE m.emailId = e.id) AS latest_received_at
    FROM email e
    WHERE ${where}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 500
  `).bind(...bindings).all<{
    id: string
    address: string
    created_at: number
    message_count: number
    latest_received_at?: number | null
  }>()
  const rows = preview.results || []

  if (!body.confirm) {
    return NextResponse.json({
      preview: {
        mode,
        count: rows.length,
        emails: rows.slice(0, 80).map(row => ({
          id: row.id,
          address: row.address,
          createdAt: row.created_at,
          messageCount: Number(row.message_count || 0),
          latestReceivedAt: row.latest_received_at,
        })),
      }
    })
  }

  const ids = rows.map(row => row.id)
  if (!ids.length) return NextResponse.json({ success: true, deleted: 0 })

  const placeholders = ids.map(() => "?").join(",")
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM message WHERE emailId IN (${placeholders})`).bind(...ids),
    env.DB.prepare(`DELETE FROM email WHERE id IN (${placeholders})`).bind(...ids),
  ])

  return NextResponse.json({ success: true, deleted: ids.length })
}
