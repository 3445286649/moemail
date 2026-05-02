import { GET as legacyList } from "../../../otp/emails/route"
import { cloneGetRequest, wrapJsonResponse } from "@/lib/api-v1"

export const runtime = "edge"

export async function GET(request: Request) {
  return wrapJsonResponse(await legacyList(cloneGetRequest(request, "/api/otp/emails")), data => ({
    emails: data.emails || [],
    total: data.total || 0,
  }))
}
