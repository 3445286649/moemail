import { extractOtp } from "./otp"

type D1 = CloudflareEnv["DB"]

type ReceivedMessageSummary = {
  id: string
  emailId: string
  subject?: string | null
  content?: string | null
  html?: string | null
  fromAddress?: string | null
  receivedAt?: Date | number | string | null
}

type LatestMessageRow = {
  id: string
  subject?: string | null
  content?: string | null
  html?: string | null
  from_address?: string | null
  received_at?: number | null
  otp_code?: string | null
  otp_provider?: string | null
  otp_confidence?: number | null
}

function toTimestamp(value?: Date | number | string | null) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? Date.now() : parsed
  }
  return Date.now()
}

function confidenceToInteger(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 100)))
}

export function extractOtpColumns(message: {
  subject?: string | null
  content?: string | null
  html?: string | null
  fromAddress?: string | null
  from?: string | null
}) {
  const otp = extractOtp({
    subject: message.subject,
    content: message.content,
    html: message.html,
    from: message.fromAddress || message.from,
  })

  return {
    code: otp.code,
    provider: otp.provider,
    confidence: confidenceToInteger(otp.confidence),
    extractedAt: Date.now(),
  }
}

export function confidenceFromInteger(value?: number | null) {
  return Math.max(0, Math.min(1, Number(value || 0) / 100))
}

export async function applyReceivedMessageSummary(db: D1, message: ReceivedMessageSummary) {
  const otp = extractOtpColumns(message)
  const receivedAt = toTimestamp(message.receivedAt)
  const now = Date.now()

  await db.batch([
    db.prepare(`
      UPDATE message
      SET otp_code = ?, otp_provider = ?, otp_confidence = ?, otp_extracted_at = ?
      WHERE id = ?
    `).bind(otp.code, otp.provider, otp.confidence, otp.extractedAt, message.id),
    db.prepare(`
	      UPDATE email
	      SET
	        message_count = COALESCE(message_count, 0) + 1,
	        latest_message_id = CASE WHEN COALESCE(latest_received_at, 0) <= ? THEN ? ELSE latest_message_id END,
	        latest_received_at = MAX(COALESCE(latest_received_at, 0), ?),
	        latest_code = CASE WHEN COALESCE(latest_received_at, 0) <= ? THEN ? ELSE latest_code END,
	        latest_otp_provider = CASE WHEN COALESCE(latest_received_at, 0) <= ? THEN ? ELSE latest_otp_provider END,
	        latest_otp_confidence = CASE WHEN COALESCE(latest_received_at, 0) <= ? THEN ? ELSE latest_otp_confidence END,
	        latest_from_address = CASE WHEN COALESCE(latest_received_at, 0) <= ? THEN ? ELSE latest_from_address END,
	        latest_subject = CASE WHEN COALESCE(latest_received_at, 0) <= ? THEN ? ELSE latest_subject END,
	        updated_at = ?
	      WHERE id = ?
	    `).bind(
	      receivedAt,
	      message.id,
	      receivedAt,
	      receivedAt,
	      otp.code,
	      receivedAt,
	      otp.provider,
	      receivedAt,
	      otp.confidence,
	      receivedAt,
	      message.fromAddress || null,
	      receivedAt,
	      message.subject || null,
	      now,
	      message.emailId,
    ),
  ])
}

export async function recomputeEmailSummary(db: D1, emailId: string) {
  const latest = await db.prepare(`
    SELECT
      id,
      subject,
      content,
      html,
      from_address,
      received_at,
      otp_code,
      otp_provider,
      otp_confidence
    FROM message
    WHERE emailId = ? AND (type != 'sent' OR type IS NULL)
    ORDER BY received_at DESC, id DESC
    LIMIT 1
  `).bind(emailId).first<LatestMessageRow>()

  const count = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM message
    WHERE emailId = ? AND (type != 'sent' OR type IS NULL)
  `).bind(emailId).first<{ count: number }>()

  if (!latest) {
    await db.prepare(`
      UPDATE email
      SET
        message_count = ?,
        latest_message_id = NULL,
        latest_received_at = NULL,
        latest_code = NULL,
        latest_otp_provider = NULL,
        latest_otp_confidence = 0,
        latest_from_address = NULL,
        latest_subject = NULL,
        updated_at = ?
      WHERE id = ?
    `).bind(Number(count?.count || 0), Date.now(), emailId).run()
    return
  }

  let code = latest.otp_code || null
  let provider = latest.otp_provider || null
  let confidence = Number(latest.otp_confidence || 0)

  if (!latest.otp_code) {
    const extracted = extractOtpColumns({
      subject: latest.subject,
      content: latest.content,
      html: latest.html,
      from: latest.from_address,
    })
    code = extracted.code
    provider = extracted.provider
    confidence = extracted.confidence
    await db.prepare(`
      UPDATE message
      SET otp_code = ?, otp_provider = ?, otp_confidence = ?, otp_extracted_at = ?
      WHERE id = ?
    `).bind(code, provider, confidence, extracted.extractedAt, latest.id).run()
  }

  await db.prepare(`
    UPDATE email
    SET
      message_count = ?,
      latest_message_id = ?,
      latest_received_at = ?,
      latest_code = ?,
      latest_otp_provider = ?,
      latest_otp_confidence = ?,
      latest_from_address = ?,
      latest_subject = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(
    Number(count?.count || 0),
    latest.id,
    latest.received_at || null,
    code,
    provider,
    confidence,
    latest.from_address || null,
    latest.subject || null,
    Date.now(),
    emailId,
  ).run()
}
