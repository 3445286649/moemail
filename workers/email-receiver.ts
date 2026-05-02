import { Env } from '../types'
import { drizzle } from 'drizzle-orm/d1'
import { messages, emails, webhooks } from '../app/lib/schema'
import { eq, sql } from 'drizzle-orm'
import PostalMime from 'postal-mime'
import { WEBHOOK_CONFIG } from '../app/config/webhook'
import { EmailMessage } from '../app/lib/webhook'
import { applyReceivedMessageSummary } from '../app/lib/email-summary'

const handleEmail = async (message: ForwardableEmailMessage, env: Env) => {
  const db = drizzle(env.DB, { schema: { messages, emails, webhooks } })

  const parsedMessage = await PostalMime.parse(message.raw)
  const html = embedInlineImages(parsedMessage.html || '', parsedMessage.attachments || [])

  console.log("parsedMessage:", parsedMessage)

  try {
    const targetEmail = await db.query.emails.findFirst({
      where: eq(sql`LOWER(${emails.address})`, message.to.toLowerCase())
    })

    if (!targetEmail) {
      console.error(`Email not found: ${message.to}`)
      return
    }

    const savedMessage = await db.insert(messages).values({
      emailId: targetEmail.id,
      fromAddress: message.from,
      toAddress: message.to,
      subject: parsedMessage.subject || '(无主题)',
      content: parsedMessage.text || '',
      html,
      type: 'received',
    }).returning().get()

    await applyReceivedMessageSummary(env.DB, {
      id: savedMessage.id,
      emailId: targetEmail.id,
      subject: savedMessage.subject,
      content: savedMessage.content,
      html: savedMessage.html,
      fromAddress: savedMessage.fromAddress,
      receivedAt: savedMessage.receivedAt,
    })

    const webhook = await db.query.webhooks.findFirst({
      where: eq(webhooks.userId, targetEmail!.userId!)
    })

    if (webhook?.enabled) {
      try {
        await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': WEBHOOK_CONFIG.EVENTS.NEW_MESSAGE
          },
          body: JSON.stringify({
            emailId: targetEmail.id,
            messageId: savedMessage.id,
            fromAddress: savedMessage.fromAddress,
            subject: savedMessage.subject,
            content: savedMessage.content,
            html: savedMessage.html,
            receivedAt: savedMessage.receivedAt.toISOString(),
            toAddress: targetEmail.address
          } as EmailMessage)
        })
      } catch (error) {
        console.error('Failed to send webhook:', error)
      }
    }

    console.log(`Email processed: ${parsedMessage.subject}`)
  } catch (error) {
    console.error('Failed to process email:', error)
  }
}

type ParsedAttachment = {
  mimeType?: string
  disposition?: "attachment" | "inline" | null
  related?: boolean
  contentId?: string
  content?: ArrayBuffer
}

function embedInlineImages(html: string, attachments: ParsedAttachment[]) {
  if (!html || !attachments.length) return html

  let nextHtml = html
  let embeddedBytes = 0
  const maxImageBytes = 512 * 1024
  const maxTotalBytes = 2 * 1024 * 1024

  for (const attachment of attachments) {
    if (!attachment.contentId || !attachment.content || !attachment.mimeType?.startsWith('image/')) {
      continue
    }

    if (attachment.disposition !== 'inline' && !attachment.related) {
      continue
    }

    const bytes = new Uint8Array(attachment.content)
    if (bytes.byteLength > maxImageBytes || embeddedBytes + bytes.byteLength > maxTotalBytes) {
      continue
    }

    const contentId = normalizeContentId(attachment.contentId)
    if (!contentId) continue

    const dataUrl = `data:${attachment.mimeType};base64,${bytesToBase64(bytes)}`
    const ids = new Set([contentId, encodeURIComponent(contentId)])

    for (const id of ids) {
      nextHtml = nextHtml.replace(new RegExp(`cid:${escapeRegExp(id)}`, 'gi'), dataUrl)
    }

    embeddedBytes += bytes.byteLength
  }

  return nextHtml
}

function normalizeContentId(contentId: string) {
  return contentId.trim().replace(/^<|>$/g, '')
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const worker = {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env)
  }
}

export default worker
