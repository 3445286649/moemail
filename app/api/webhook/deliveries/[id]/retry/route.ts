import { auth } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { emails, messages, webhookDeliveries, webhooks } from "@/lib/schema"
import { WEBHOOK_CONFIG } from "@/config"
import { callWebhook, type EmailMessage } from "@/lib/webhook"
import { and, eq } from "drizzle-orm"

export const runtime = "edge"

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const db = createDb()
  const delivery = await db.query.webhookDeliveries.findFirst({
    where: and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.userId, session.user.id)),
  })
  if (!delivery) return Response.json({ error: "Delivery not found" }, { status: 404 })

  const webhook = await db.query.webhooks.findFirst({
    where: and(eq(webhooks.userId, session.user.id), eq(webhooks.enabled, true)),
  })
  if (!webhook) return Response.json({ error: "Webhook is disabled or missing" }, { status: 400 })

  const message = delivery.messageId
    ? await db.query.messages.findFirst({ where: eq(messages.id, delivery.messageId) })
    : null
  const email = delivery.emailId
    ? await db.query.emails.findFirst({ where: and(eq(emails.id, delivery.emailId), eq(emails.userId, session.user.id)) })
    : null

  if (!message || !email) return Response.json({ error: "Original message is missing" }, { status: 404 })

  const payload = {
    event: WEBHOOK_CONFIG.EVENTS.NEW_MESSAGE,
    data: {
      emailId: email.id,
      messageId: message.id,
      fromAddress: message.fromAddress || "",
      subject: message.subject,
      content: message.content,
      html: message.html || "",
      receivedAt: message.receivedAt.toISOString(),
      toAddress: email.address,
    } satisfies EmailMessage,
  }
  const result = await callWebhook(webhook.url, payload)
  const now = new Date()
  await db.insert(webhookDeliveries).values({
    webhookId: webhook.id,
    userId: session.user.id,
    messageId: message.id,
    emailId: email.id,
    event: payload.event,
    targetUrl: webhook.url,
    status: result.ok ? "success" : "failed",
    httpStatus: result.status || null,
    attempts: result.attempts,
    durationMs: result.durationMs,
    error: result.error || null,
    createdAt: now,
    updatedAt: now,
  })

  return Response.json({ success: result.ok, result })
}
