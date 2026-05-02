import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"
import { confidenceFromInteger } from "@/lib/email-summary"

export const runtime = "edge"

type StatusFilter = "all" | "new" | "code" | "empty" | "used"

interface OtpRow {
  id: string
  address: string
  created_at: number
  expires_at: number
  batch_id?: string | null
  batch_name?: string | null
  tags?: string | null
  used?: number | null
  message_count: number
  latest_received_at?: number | null
  latest_message_id?: string | null
  latest_subject?: string | null
  latest_from?: string | null
  latest_code?: string | null
  latest_otp_provider?: string | null
  latest_otp_confidence?: number | null
  updated_at?: number | null
}

interface SummaryRow {
  total?: number | null
  message_count?: number | null
  code_count?: number | null
  received_count?: number | null
  empty_count?: number | null
  used_count?: number | null
  latest_received_at?: number | null
  version?: number | null
}

interface ListQuery {
  where: string
  bindings: Array<string | number>
  summaryWhere: string
  summaryBindings: Array<string | number>
  page: number
  limit: number
  offset: number
  status: StatusFilter
  hasScopedFilters: boolean
}

function parseTags(value?: string | null) {
  return (value || "").split(",").map(tag => tag.trim()).filter(Boolean)
}

function normalizeStatus(value: string | null): StatusFilter {
  if (value === "new" || value === "code" || value === "empty" || value === "used") return value
  return "all"
}

function buildListQuery(request: Request, userId: string): ListQuery {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim().toLowerCase()
  const recentHours = Number(searchParams.get("recentHours") || 0)
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 100)
  const page = Math.max(Number(searchParams.get("page") || 1), 1)
  const offset = Math.min(Math.max(Number(searchParams.get("offset") || (page - 1) * limit), 0), 100000)
  const domain = (searchParams.get("domain") || "").trim().toLowerCase()
  const tag = (searchParams.get("tag") || "").trim().toLowerCase()
  const batchId = (searchParams.get("batchId") || "").trim()
  const used = searchParams.get("used")
  const status = normalizeStatus(searchParams.get("status"))
  const now = Date.now()
  const since = recentHours > 0 ? now - recentHours * 60 * 60 * 1000 : 0

  const clauses = ["e.userId = ?", "e.expires_at > ?"]
  const bindings: Array<string | number> = [userId, now]

  if (q) {
    clauses.push(`(
      LOWER(e.address) LIKE ?
      OR LOWER(COALESCE(e.tags, '')) LIKE ?
      OR LOWER(COALESCE(b.name, '')) LIKE ?
      OR LOWER(COALESCE(e.latest_subject, '')) LIKE ?
      OR LOWER(COALESCE(e.latest_from_address, '')) LIKE ?
      OR LOWER(COALESCE(e.latest_code, '')) LIKE ?
    )`)
    const like = `%${q}%`
    bindings.push(like, like, like, like, like, like)
  }
  if (domain) {
    clauses.push("LOWER(e.address) LIKE ?")
    bindings.push(`%@${domain}`)
  }
  if (tag) {
    clauses.push("(',' || LOWER(COALESCE(e.tags, '')) || ',') LIKE ?")
    bindings.push(`%,${tag},%`)
  }
  if (batchId) {
    clauses.push("e.batch_id = ?")
    bindings.push(batchId)
  }
  if (used === "1" || used === "true") clauses.push("COALESCE(e.used, 0) = 1")
  if (used === "0" || used === "false") clauses.push("COALESCE(e.used, 0) = 0")
  if (recentHours > 0) {
    clauses.push("e.latest_received_at >= ?")
    bindings.push(since)
  }
  if (status === "new") clauses.push("e.latest_received_at IS NOT NULL")
  if (status === "code") clauses.push("e.latest_code IS NOT NULL AND e.latest_code != ''")
  if (status === "empty") clauses.push("COALESCE(e.message_count, 0) = 0")
  if (status === "used") clauses.push("COALESCE(e.used, 0) = 1")

  const summaryClauses = [...clauses]
  const summaryBindings = [...bindings]
  const hasScopedFilters = Boolean(q || recentHours > 0 || domain || tag || batchId || used)

  return {
    where: clauses.join(" AND "),
    bindings,
    summaryWhere: summaryClauses.join(" AND "),
    summaryBindings,
    page,
    limit,
    offset,
    status,
    hasScopedFilters,
  }
}

function stateSummary(row: SummaryRow | null | undefined, status: StatusFilter) {
  const total = Number(row?.total || 0)
  const receivedCount = Number(row?.received_count || 0)
  const codeCount = Number(row?.code_count || 0)
  const emptyCount = Number(row?.empty_count || 0)
  const usedCount = Number(row?.used_count || 0)
  const statusTotal = status === "new"
    ? receivedCount
    : status === "code"
      ? codeCount
      : status === "empty"
        ? emptyCount
        : status === "used"
          ? usedCount
          : total

  return {
    version: Number(row?.version || 0),
    total: statusTotal,
    messageCount: Number(row?.message_count || 0),
    codeCount,
    receivedCount,
    emptyCount,
    usedCount,
    latestReceivedAt: Number(row?.latest_received_at || 0) || null,
    statusCounts: {
      all: total,
      new: receivedCount,
      code: codeCount,
      empty: emptyCount,
      used: usedCount,
    },
  }
}

export async function GET(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const env = getRequestContext().env
  const query = buildListQuery(request, userId)

  const listBindings = [...query.bindings, query.limit, query.offset]
  const listPromise = env.DB.prepare(`
    SELECT
      e.id,
      e.address,
      e.created_at,
      e.expires_at,
      e.batch_id,
      b.name AS batch_name,
      e.tags,
      e.used,
      COALESCE(e.message_count, 0) AS message_count,
      e.latest_received_at,
      e.latest_message_id,
      e.latest_subject,
      e.latest_from_address AS latest_from,
      e.latest_code,
      e.latest_otp_provider,
      e.latest_otp_confidence,
      e.updated_at
    FROM email e
    LEFT JOIN otp_batch b ON b.id = e.batch_id AND b.user_id = e.userId
    WHERE ${query.where}
    ORDER BY COALESCE(e.latest_received_at, e.created_at) DESC, e.id DESC
    LIMIT ? OFFSET ?
  `).bind(...listBindings).all<OtpRow>()

  const summaryPromise = query.hasScopedFilters
    ? env.DB.prepare(`
      SELECT
        COUNT(e.id) AS total,
        COALESCE(SUM(COALESCE(e.message_count, 0)), 0) AS message_count,
        COALESCE(SUM(CASE WHEN e.latest_code IS NOT NULL AND e.latest_code != '' THEN 1 ELSE 0 END), 0) AS code_count,
        COALESCE(SUM(CASE WHEN e.latest_received_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS received_count,
        COALESCE(SUM(CASE WHEN COALESCE(e.message_count, 0) = 0 THEN 1 ELSE 0 END), 0) AS empty_count,
        COALESCE(SUM(CASE WHEN COALESCE(e.used, 0) = 1 THEN 1 ELSE 0 END), 0) AS used_count,
        MAX(e.latest_received_at) AS latest_received_at,
        MAX(COALESCE(e.updated_at, e.latest_received_at, e.created_at, 0)) AS version
      FROM email e
      LEFT JOIN otp_batch b ON b.id = e.batch_id AND b.user_id = e.userId
      WHERE ${query.summaryWhere}
    `).bind(...query.summaryBindings).first<SummaryRow>()
    : env.DB.prepare(`
      SELECT
        total,
        message_count,
        code_count,
        received_count,
        empty_count,
        used_count,
        latest_received_at,
        version
      FROM otp_user_state
      WHERE user_id = ?
    `).bind(userId).first<SummaryRow>()

  const [result, summaryRow] = await Promise.all([listPromise, summaryPromise])
  const rows = result.results || []
  const emails = rows.map(row => ({
    id: row.id,
    address: row.address,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    batchId: row.batch_id,
    batchName: row.batch_name,
    tags: parseTags(row.tags),
    used: Boolean(row.used),
    messageCount: Number(row.message_count || 0),
    latestMessageId: row.latest_message_id,
    latestSubject: row.latest_subject,
    latestFrom: row.latest_from,
    latestReceivedAt: row.latest_received_at,
    latestCode: row.latest_code,
    provider: row.latest_otp_provider,
    confidence: confidenceFromInteger(row.latest_otp_confidence),
    updatedAt: row.updated_at,
  }))
  const summary = stateSummary(summaryRow, query.status)

  return NextResponse.json({
    emails,
    total: summary.total,
    pagination: {
      page: query.page,
      pageSize: query.limit,
      offset: query.offset,
      total: summary.total,
      totalPages: Math.max(1, Math.ceil(summary.total / query.limit)),
      hasMore: query.offset + emails.length < summary.total,
    },
    summary,
  })
}

export async function PATCH(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { ids?: string[]; used?: boolean; tags?: string[] }
  const ids = (body.ids || []).filter(Boolean).slice(0, 200)
  if (!ids.length) return NextResponse.json({ error: "请选择邮箱" }, { status: 400 })

  const updates: string[] = []
  const values: Array<string | number> = []
  if (typeof body.used === "boolean") {
    updates.push("used = ?")
    values.push(body.used ? 1 : 0)
  }
  if (Array.isArray(body.tags)) {
    const tags = Array.from(new Set(body.tags.map(tag => String(tag).trim().toLowerCase()).filter(Boolean))).slice(0, 8)
    updates.push("tags = ?")
    values.push(tags.join(","))
  }
  if (!updates.length) return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 })
  updates.push("updated_at = ?")
  values.push(Date.now())

  const env = getRequestContext().env
  const placeholders = ids.map(() => "?").join(",")
  const result = await env.DB.prepare(`UPDATE email SET ${updates.join(", ")} WHERE userId = ? AND id IN (${placeholders})`)
    .bind(...values, userId, ...ids)
    .run()

  return NextResponse.json({ success: true, updated: result.meta?.changes || 0 })
}

export async function DELETE(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { ids?: string[]; testOnly?: boolean; confirm?: boolean }
  const env = getRequestContext().env
  let ids = (body.ids || []).filter(Boolean).slice(0, 200)

  if (body.testOnly) {
    const result = await env.DB.prepare(`
      SELECT id FROM email
      WHERE userId = ?
        AND (
          LOWER(address) LIKE 'graytest%'
          OR LOWER(address) LIKE 'tailtest%'
          OR LOWER(address) LIKE 'finaltest%'
          OR LOWER(address) LIKE 'routetest%'
          OR LOWER(address) LIKE 'uitest%'
          OR LOWER(address) LIKE 'smtptest%'
          OR LOWER(address) LIKE 'nulltest%'
          OR LOWER(address) LIKE 'test%'
        )
      LIMIT 200
    `).bind(userId).all<{ id: string }>()
    ids = (result.results || []).map(row => row.id)
  }

  if (!ids.length) return NextResponse.json({ success: true, deleted: 0 })
  if (!body.confirm && ids.length > 5) {
    return NextResponse.json({ error: "批量删除需要先走清理预览或传入确认标记" }, { status: 400 })
  }

  const placeholders = ids.map(() => "?").join(",")
  const owned = await env.DB.prepare(`SELECT id FROM email WHERE userId = ? AND id IN (${placeholders})`)
    .bind(userId, ...ids)
    .all<{ id: string }>()
  const ownedIds = (owned.results || []).map(row => row.id)
  if (!ownedIds.length) return NextResponse.json({ success: true, deleted: 0 })

  const ownedPlaceholders = ownedIds.map(() => "?").join(",")
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM message WHERE emailId IN (${ownedPlaceholders})`).bind(...ownedIds),
    env.DB.prepare(`DELETE FROM email WHERE id IN (${ownedPlaceholders})`).bind(...ownedIds),
  ])

  return NextResponse.json({ success: true, deleted: ownedIds.length })
}
