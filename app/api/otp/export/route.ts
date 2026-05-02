import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"
import { nanoid } from "nanoid"

export const runtime = "edge"

interface ExportBody {
  ids?: string[]
  q?: string
  recentHours?: number
  limit?: number
  locale?: string
  batchId?: string
  tag?: string
  used?: boolean
  status?: "all" | "new" | "code" | "empty" | "used"
}

interface EmailRow {
  id: string
  address: string
}

interface ShareRow {
  token: string
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as ExportBody
  const env = getRequestContext().env
  const now = Date.now()
  const limit = Math.min(Math.max(Number(body.limit || 200), 1), 500)
  const ids = (body.ids || []).filter(Boolean).slice(0, 500)
  let rows: EmailRow[] = []

  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",")
    const result = await env.DB.prepare(`
      SELECT id, address FROM email
      WHERE userId = ? AND expires_at > ? AND id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `).bind(userId, now, ...ids).all<EmailRow>()
    const order = new Map(ids.map((id, index) => [id, index]))
    rows = (result.results || []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  } else {
    const q = (body.q || "").trim().toLowerCase()
    const recentHours = Number(body.recentHours || 0)
    const since = recentHours > 0 ? now - recentHours * 60 * 60 * 1000 : 0
    const tag = (body.tag || "").trim().toLowerCase()
    const clauses = ["e.userId = ?", "e.expires_at > ?"]
    const bindings: Array<string | number> = [userId, now]
    if (q) {
      clauses.push(`(
        LOWER(e.address) LIKE ?
        OR LOWER(COALESCE(e.tags, '')) LIKE ?
        OR LOWER(COALESCE(e.latest_subject, '')) LIKE ?
        OR LOWER(COALESCE(e.latest_code, '')) LIKE ?
      )`)
      const like = `%${q}%`
      bindings.push(like, like, like, like)
    }
    if (body.batchId) {
      clauses.push("e.batch_id = ?")
      bindings.push(body.batchId)
    }
    if (tag) {
      clauses.push("(',' || LOWER(COALESCE(e.tags, '')) || ',') LIKE ?")
      bindings.push(`%,${tag},%`)
    }
    if (typeof body.used === "boolean") {
      clauses.push("COALESCE(e.used, 0) = ?")
      bindings.push(body.used ? 1 : 0)
    }
    if (body.status === "new") clauses.push("e.latest_received_at IS NOT NULL")
    if (body.status === "code") clauses.push("e.latest_code IS NOT NULL AND e.latest_code != ''")
    if (body.status === "empty") clauses.push("COALESCE(e.message_count, 0) = 0")
    if (body.status === "used") clauses.push("COALESCE(e.used, 0) = 1")
    if (recentHours > 0) {
      clauses.push("e.latest_received_at >= ?")
      bindings.push(since)
    }
    bindings.push(limit)
    const result = await env.DB.prepare(`
      SELECT e.id, e.address
      FROM email e
      WHERE ${clauses.join(" AND ")}
      ORDER BY e.latest_received_at DESC NULLS LAST, e.created_at DESC, e.id DESC
      LIMIT ?
    `).bind(...bindings).all<EmailRow>()
    rows = result.results || []
  }

  const locale = (body.locale || "zh-CN").replace(/[^A-Za-z0-9-]/g, "") || "zh-CN"
  const requestUrl = new URL(request.url)
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host")
  const forwardedProto = request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "") || "https"
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin
  const lines: string[] = []

  const maxAddressLength = rows.reduce((max, row) => Math.max(max, row.address.length), 0)

  for (const row of rows) {
    const existing = await env.DB.prepare(`
      SELECT token FROM email_share
      WHERE email_id = ? AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(row.id, now).first<ShareRow>()

    let token = existing?.token
    if (!token) {
      token = nanoid(16)
      await env.DB.prepare(`
        INSERT INTO email_share (id, email_id, token, created_at, expires_at)
        VALUES (?, ?, ?, ?, NULL)
      `).bind(crypto.randomUUID(), row.id, token, now).run()
    }

    const shareUrl = `${origin}/${locale}/shared/${token}`
    lines.push(`账号：${row.address.padEnd(maxAddressLength, " ")}    接码地址：${shareUrl}`)
  }

  const text = lines.join("\n") + (lines.length ? "\n" : "")
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mail.txt"',
      "X-Export-Count": String(lines.length),
    },
  })
}
