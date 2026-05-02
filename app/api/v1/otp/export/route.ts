import { POST as legacyExport } from "../../../otp/export/route"
import { apiError, apiOk, cloneJsonRequest, codeFromStatus } from "@/lib/api-v1"

export const runtime = "edge"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const response = await legacyExport(cloneJsonRequest(request, "/api/otp/export", body))

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string }
    return apiError(codeFromStatus(response.status), data?.error || "导出失败", response.status, data)
  }

  const content = await response.text()
  const count = Number(response.headers.get("X-Export-Count") || 0)
  return apiOk({
    content,
    count,
    content_type: response.headers.get("Content-Type") || "text/plain; charset=utf-8",
    filename: "mail.txt",
  })
}
