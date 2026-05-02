import { WEBHOOK_CONFIG } from "@/config"

export interface EmailMessage {
  emailId: string
  messageId: string
  fromAddress: string
  subject: string
  content: string
  html: string
  receivedAt: string
  toAddress: string
}

export interface WebhookPayload {
  event: typeof WEBHOOK_CONFIG.EVENTS[keyof typeof WEBHOOK_CONFIG.EVENTS]
  data: EmailMessage
}

export interface WebhookCallResult {
  ok: boolean
  status?: number
  attempts: number
  durationMs: number
  error?: string
}

export async function callWebhook(url: string, payload: WebhookPayload): Promise<WebhookCallResult> {
  let lastError: Error | null = null
  let lastStatus: number | undefined
  const started = Date.now()
  
  for (let i = 0; i < WEBHOOK_CONFIG.MAX_RETRIES; i++) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), WEBHOOK_CONFIG.TIMEOUT)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": payload.event,
        },
        body: JSON.stringify(payload.data),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      timeoutId = undefined

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          attempts: i + 1,
          durationMs: Date.now() - started,
        }
      }

      lastStatus = response.status
      lastError = new Error(`HTTP error! status: ${response.status}`)
    } catch (error) {
      lastError = error as Error
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
      
    if (i < WEBHOOK_CONFIG.MAX_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, WEBHOOK_CONFIG.RETRY_DELAY))
    }
  }

  return {
    ok: false,
    status: lastStatus,
    attempts: WEBHOOK_CONFIG.MAX_RETRIES,
    durationMs: Date.now() - started,
    error: lastError?.message || "Webhook delivery failed",
  }
} 
