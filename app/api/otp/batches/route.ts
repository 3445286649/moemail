import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

interface BatchRow {
  id: string
  name: string
  source: string
  created_at: number
  updated_at: number
  email_count: number
  used_count: number
  message_count: number
  latest_received_at?: number | null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const env = getRequestContext().env
  const result = await env.DB.prepare(`
    SELECT
      b.id,
      b.name,
      b.source,
      b.created_at,
      b.updated_at,
      COUNT(e.id) AS email_count,
      SUM(CASE WHEN COALESCE(e.used, 0) = 1 THEN 1 ELSE 0 END) AS used_count,
      COALESCE(SUM(COALESCE(e.message_count, 0)), 0) AS message_count,
      MAX(e.latest_received_at) AS latest_received_at
    FROM otp_batch b
    LEFT JOIN email e ON e.batch_id = b.id AND e.userId = b.user_id
    WHERE b.user_id = ?
    GROUP BY b.id
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT 100
  `).bind(userId).all<BatchRow>()

  const batches = (result.results || []).map(row => ({
    id: row.id,
    name: row.name,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    emailCount: Number(row.email_count || 0),
    usedCount: Number(row.used_count || 0),
    messageCount: Number(row.message_count || 0),
    latestReceivedAt: row.latest_received_at,
  }))

  return NextResponse.json({ batches })
}
