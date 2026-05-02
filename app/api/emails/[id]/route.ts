import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emails, messages } from "@/lib/schema"
import { eq, and } from "drizzle-orm"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"
import { checkBasicSendPermission } from "@/lib/send-permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"

export const runtime = "edge"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()

  try {
    const db = createDb()
    const { id } = await params
    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId!)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "邮箱不存在或无权限删除" },
        { status: 403 }
      )
    }
    await db.delete(messages)
      .where(eq(messages.emailId, id))

    await db.delete(emails)
      .where(eq(emails.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete email:', error)
    return NextResponse.json(
      { error: "删除邮箱失败" },
      { status: 500 }
    )
  }
}

const PAGE_SIZE = 30

interface MessageRow {
  id: string
  from_address?: string | null
  to_address?: string | null
  subject: string
  type?: string | null
  received_at?: number | null
  sent_at?: number | null
  otp_code?: string | null
  otp_provider?: string | null
  otp_confidence?: number | null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url)
  const cursorStr = searchParams.get('cursor')
  const messageType = searchParams.get('type')

  try {
    const { id } = await params

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })
    if (messageType === 'sent') {
      const permissionResult = await checkBasicSendPermission(userId)
      if (!permissionResult.canSend) {
        return NextResponse.json(
          { error: permissionResult.error || "您没有查看发送邮件的权限" },
          { status: 403 }
        )
      }
    }

    const db = createDb()
    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "无权限查看" },
        { status: 403 }
      )
    }

    const env = getRequestContext().env
    const clauses = ["emailId = ?"]
    const bindings: Array<string | number> = [id]
    if (messageType === "sent") {
      clauses.push("type = 'sent'")
    } else {
      clauses.push("(type != 'sent' OR type IS NULL)")
    }

    if (cursorStr) {
      const { timestamp, id: cursorId } = decodeCursor(cursorStr)
      const timeColumn = messageType === "sent" ? "sent_at" : "received_at"
      clauses.push(`(${timeColumn} < ? OR (${timeColumn} = ? AND id < ?))`)
      bindings.push(timestamp, timestamp, cursorId)
    }

    const countClauses = clauses.filter(clause => !clause.includes(" < ? OR"))
    const countBindings = cursorStr ? bindings.slice(0, -3) : bindings
    const countPromise = messageType === "sent"
      ? env.DB.prepare(`SELECT COUNT(*) AS count FROM message WHERE ${countClauses.join(" AND ")}`)
        .bind(...countBindings)
        .first<{ count: number }>()
      : Promise.resolve({ count: email.messageCount || 0 })
    const timeColumn = messageType === "sent" ? "sent_at" : "received_at"
    const resultPromise = env.DB.prepare(`
      SELECT
        id,
        from_address,
        to_address,
        subject,
        type,
        received_at,
        sent_at,
        otp_code,
        otp_provider,
        otp_confidence
      FROM message
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${timeColumn} DESC, id DESC
      LIMIT ?
    `).bind(...bindings, PAGE_SIZE + 1).all<MessageRow>()

    const [totalResult, result] = await Promise.all([countPromise, resultPromise])
    const results = result.results || []
    const totalCount = Number(totalResult?.count || 0)

    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore
      ? encodeCursor(
          Number(messageType === 'sent'
            ? results[PAGE_SIZE - 1].sent_at
            : results[PAGE_SIZE - 1].received_at),
          results[PAGE_SIZE - 1].id
        )
      : null
    const messageList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({
      messages: messageList.map(msg => ({
        id: msg.id,
        from_address: msg?.from_address,
        to_address: msg?.to_address,
        subject: msg.subject,
        otp_code: msg.otp_code,
        otp_provider: msg.otp_provider,
        otp_confidence: Number(msg.otp_confidence || 0) / 100,
        sent_at: msg.sent_at,
        received_at: msg.received_at,
      })),
      nextCursor,
      total: totalCount
    })
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    )
  }
}
