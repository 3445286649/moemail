import { GET as legacyLatest } from "../../../otp/latest/route"
import { cloneGetRequest, wrapJsonResponse } from "@/lib/api-v1"

export const runtime = "edge"

export async function GET(request: Request) {
  return wrapJsonResponse(await legacyLatest(cloneGetRequest(request, "/api/otp/latest")), data => ({
    email: data.email,
    code: data.code,
    provider: data.provider || null,
    confidence: data.confidence || 0,
    subject: data.subject || null,
    from: data.from || null,
    received_at: data.received_at || null,
    message_id: data.raw_message_id || data.message?.id || null,
    message: data.message || null,
  }))
}
