import { POST as legacyCreate } from "../../../otp/create/route"
import { cloneJsonRequest, wrapJsonResponse } from "@/lib/api-v1"

export const runtime = "edge"

type CreateBody = {
  name?: string
  local_part?: string
  localPart?: string
  prefix?: string
  domain?: string
  count?: number
  mode?: string
  expiry_time_ms?: number
  expiryTime?: number
  batch_name?: string
  batchName?: string
  tags?: string[]
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as CreateBody
  const legacyRequest = cloneJsonRequest(request, "/api/otp/create", {
    name: body.name || body.local_part || body.localPart,
    prefix: body.prefix,
    domain: body.domain,
    count: body.count,
    mode: body.mode,
    expiryTime: body.expiry_time_ms ?? body.expiryTime ?? 0,
    batchName: body.batch_name ?? body.batchName,
    tags: body.tags,
  })

  return wrapJsonResponse(await legacyCreate(legacyRequest), data => ({
    id: data.id,
    email: data.email,
    emails: data.created || [],
    count: data.count || 0,
    batch_id: data.batchId || null,
    batch_name: data.batchName || null,
  }))
}
