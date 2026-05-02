import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { confidenceFromInteger } from "@/lib/email-summary"

export const runtime = "edge"

const PAGE_SIZE = 30

interface EmailRow {
  id: string
  address: string
  created_at: number
  expires_at: number
  message_count?: number | null
  latest_message_id?: string | null
  latest_code?: string | null
  latest_subject?: string | null
  latest_from_address?: string | null
  latest_received_at?: number | null
  latest_otp_provider?: string | null
  latest_otp_confidence?: number | null
  updated_at?: number | null
}

interface StateRow {
  version?: number | null
  total?: number | null
}

export async function GET(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get("cursor")
  const q = (searchParams.get("q") || "").trim().toLowerCase()
  const recentOnly = searchParams.get("recentOnly") === "1" || searchParams.get("recentOnly") === "true"
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || PAGE_SIZE), 1), 80)
  const now = Date.now()
  const since = now - 24 * 60 * 60 * 1000
  const env = getRequestContext().env

  const clauses = ["userId = ?", "expires_at > ?"]
  const bindings: Array<string | number> = [userId, now]

  if (q) {
    clauses.push("LOWER(address) LIKE ?")
    bindings.push(`%${q}%`)
  }

  if (recentOnly) {
    clauses.push("latest_received_at >= ?")
    bindings.push(since)
  }

  if (cursor) {
    const { timestamp, id } = decodeCursor(cursor)
    clauses.push("(COALESCE(latest_received_at, created_at) < ? OR (COALESCE(latest_received_at, created_at) = ? AND id < ?))")
    bindings.push(timestamp, timestamp, id)
  }

  const summaryClauses = cursor ? clauses.slice(0, -1) : clauses
  const summaryBindings = cursor ? bindings.slice(0, -3) : bindings
  const totalPromise = env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      MAX(COALESCE(updated_at, latest_received_at, created_at, 0)) AS version
    FROM email
    WHERE ${summaryClauses.join(" AND ")}
  `).bind(...summaryBindings).first<StateRow>()

  const result = await env.DB.prepare(`
    SELECT
      id,
      address,
      created_at,
      expires_at,
      COALESCE(message_count, 0) AS message_count,
      latest_message_id,
      latest_code,
      latest_subject,
      latest_from_address,
      latest_received_at,
      latest_otp_provider,
      latest_otp_confidence,
      updated_at
    FROM email
    WHERE ${clauses.join(" AND ")}
    ORDER BY COALESCE(latest_received_at, created_at) DESC, id DESC
    LIMIT ?
  `).bind(...bindings, limit + 1).all<EmailRow>()

  const state = await totalPromise
  const rows = result.results || []
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const last = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && last
    ? encodeCursor(Number(last.latest_received_at || last.created_at), last.id)
    : null

  return NextResponse.json({
    emails: pageRows.map(email => ({
      id: email.id,
      address: email.address,
      createdAt: email.created_at,
      expiresAt: email.expires_at,
      messageCount: Number(email.message_count || 0),
      latestMessageId: email.latest_message_id,
      latestCode: email.latest_code,
      latestSubject: email.latest_subject,
      latestFrom: email.latest_from_address,
      latestReceivedAt: email.latest_received_at,
      provider: email.latest_otp_provider,
      confidence: confidenceFromInteger(email.latest_otp_confidence),
      updatedAt: email.updated_at,
    })),
    nextCursor,
    total: Number(state?.total || 0),
    version: Number(state?.version || 0),
  })
}
