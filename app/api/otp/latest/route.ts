import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emails, messages } from "@/lib/schema"
import { and, eq, ne, or, isNull, sql } from "drizzle-orm"
import { getUserId } from "@/lib/apiKey"
import { extractOtp } from "@/lib/otp"
import { confidenceFromInteger, recomputeEmailSummary } from "@/lib/email-summary"
import { getRequestContext } from "@cloudflare/next-on-pages"

export const runtime = "edge"

export async function GET(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const address = (searchParams.get("email") || "").trim().toLowerCase()
  if (!address) return NextResponse.json({ error: "email 不能为空" }, { status: 400 })

  const db = createDb()
  const email = await db.query.emails.findFirst({
    where: and(
      eq(sql`LOWER(${emails.address})`, address),
      eq(emails.userId, userId)
    )
  })

  if (!email) return NextResponse.json({ error: "邮箱不存在或无权限查看" }, { status: 404 })

  let message = email.latestMessageId
    ? await db.query.messages.findFirst({
        where: and(
          eq(messages.id, email.latestMessageId),
          eq(messages.emailId, email.id),
        )
      })
    : null

  if (!message) {
    message = await db.query.messages.findFirst({
      where: and(
        eq(messages.emailId, email.id),
        or(ne(messages.type, "sent"), isNull(messages.type))
      ),
      orderBy: (messages, { desc }) => [desc(messages.receivedAt), desc(messages.id)],
    })
    if (message) {
      await recomputeEmailSummary(getRequestContext().env.DB, email.id)
    }
  }

  if (!message) {
    return NextResponse.json({ email: email.address, code: null, message: null })
  }

  const otp = email.latestCode
    ? {
        code: email.latestCode,
        provider: email.latestOtpProvider || "unknown",
        confidence: confidenceFromInteger(email.latestOtpConfidence),
      }
    : extractOtp({
        subject: message.subject,
        content: message.content,
        html: message.html,
        from: message.fromAddress,
      })

  return NextResponse.json({
    email: email.address,
    code: otp.code,
    provider: otp.provider,
    confidence: otp.confidence,
    subject: message.subject,
    from: message.fromAddress,
    received_at: message.receivedAt.getTime(),
    raw_message_id: message.id,
    message: {
      id: message.id,
      subject: message.subject,
      from_address: message.fromAddress,
      content: message.content,
      html: message.html,
      received_at: message.receivedAt.getTime(),
    }
  })
}
