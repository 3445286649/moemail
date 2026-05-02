import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { and, eq, gt, sql } from "drizzle-orm"
import { getUserId } from "@/lib/apiKey"
import { getUserRole } from "@/lib/auth"
import { createEmailName, sanitizeEmailName, type EmailNameMode } from "@/lib/random-email-name"
import { EXPIRY_OPTIONS } from "@/types/email"
import { resolveActiveEmailDomains } from "@/lib/domain-config"
import { EMAIL_CONFIG } from "@/config"
import { ROLES } from "@/lib/permissions"

export const runtime = "edge"

interface CreateOtpBody {
  name?: string
  prefix?: string
  domain?: string
  count?: number
  mode?: EmailNameMode
  expiryTime?: number
  batchName?: string
  tags?: string[]
}

function sanitizeTags(tags?: string[]) {
  return Array.from(new Set((tags || [])
    .map(tag => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .map(tag => tag.replace(/[^a-z0-9_\-\u4e00-\u9fa5]/g, "").slice(0, 24))
    .filter(Boolean)))
    .slice(0, 8)
}

function sanitizeBatchName(value: string, fallback: string) {
  return (value || fallback).trim().replace(/[\r\n\t]/g, " ").slice(0, 80) || fallback
}

function isUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /unique|constraint/i.test(message)
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const body = await request.json().catch(() => ({})) as CreateOtpBody
  const env = getRequestContext().env
  const db = createDb()

  const [domainString, activeDomainString] = await Promise.all([
    env.SITE_CONFIG.get("EMAIL_DOMAINS"),
    env.SITE_CONFIG.get("ACTIVE_EMAIL_DOMAINS"),
  ])
  const domains = resolveActiveEmailDomains(domainString || "moemail.app", activeDomainString)
  const domain = (body.domain || domains[0] || "").trim().toLowerCase()

  if (!domain || !domains.includes(domain)) {
    return NextResponse.json({ error: "无效的域名或该域名未启用" }, { status: 400 })
  }

  const count = Math.min(Math.max(Number(body.count || 1), 1), 50)
  const expiryTime = typeof body.expiryTime === "number" ? body.expiryTime : 0
  if (!EXPIRY_OPTIONS.some(option => option.value === expiryTime)) {
    return NextResponse.json({ error: "无效的过期时间" }, { status: 400 })
  }

  const userRole = await getUserRole(userId)
  if (userRole !== ROLES.EMPEROR) {
    const maxEmails = Number(await env.SITE_CONFIG.get("MAX_EMAILS") || EMAIL_CONFIG.MAX_ACTIVE_EMAILS)
    const activeEmailsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(
        eq(emails.userId, userId),
        gt(emails.expiresAt, new Date()),
      ))

    if (Number(activeEmailsCount[0]?.count || 0) + count > maxEmails) {
      return NextResponse.json(
        { error: `已达到最大邮箱数量限制 (${maxEmails})` },
        { status: 403 },
      )
    }
  }

  const now = new Date()
  const nowMs = now.getTime()
  const expiresAt = expiryTime === 0 ? new Date("9999-01-01T00:00:00.000Z") : new Date(now.getTime() + expiryTime)
  const created = [] as Array<{ id: string; email: string; address: string }>
  const mode = body.mode || (body.name ? "prefix" : "human")
  const fixedName = sanitizeEmailName(body.name || "")
  const prefix = sanitizeEmailName(body.prefix || body.name || "")
  const tags = sanitizeTags(body.tags)
  const shouldCreateBatch = count > 1 || Boolean(body.batchName?.trim())
  const batchId = shouldCreateBatch ? crypto.randomUUID() : null
  const batchName = shouldCreateBatch
    ? sanitizeBatchName(body.batchName || "", `${new Date(nowMs).toLocaleString("zh-CN", { hour12: false })} 批量邮箱`)
    : null

  if (batchId && batchName) {
    await env.DB.prepare(`
      INSERT INTO otp_batch (id, user_id, name, source, created_at, updated_at, notes)
      VALUES (?, ?, ?, 'otp-console', ?, ?, NULL)
    `).bind(batchId, userId, batchName, nowMs, nowMs).run()
  }

  for (let i = 0; i < count; i++) {
    let inserted = false
    for (let attempt = 0; attempt < 8; attempt++) {
      const local = count === 1 && fixedName && attempt === 0
        ? fixedName
        : createEmailName(mode, prefix)
      const address = `${local}@${domain}`
      const existing = await db.query.emails.findFirst({
        where: eq(sql`LOWER(${emails.address})`, address.toLowerCase())
      })
      if (existing) continue

      try {
        const [result] = await db.insert(emails).values({
          address,
          createdAt: now,
          expiresAt,
          userId,
          batchId: batchId || undefined,
          tags: tags.length ? tags.join(",") : undefined,
          used: false,
          updatedAt: now,
        }).returning({ id: emails.id, address: emails.address })

        created.push({ id: result.id, email: result.address, address: result.address })
        inserted = true
        break
      } catch (error) {
        if (isUniqueConstraintError(error)) continue
        throw error
      }
    }

    if (!inserted) {
      return NextResponse.json({
        error: `第 ${i + 1} 个邮箱生成失败，请换前缀或稍后重试`,
        created,
        batchId,
      }, { status: 409 })
    }
  }

  return NextResponse.json({
    id: created[0]?.id,
    email: created[0]?.email,
    created,
    count: created.length,
    batchId,
    batchName,
  })
}
