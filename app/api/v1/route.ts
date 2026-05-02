import { apiOk, getPublicOrigin } from "@/lib/api-v1"

export const runtime = "edge"

export async function GET(request: Request) {
  const origin = getPublicOrigin(request)
  return apiOk({
    name: "MoeMail OTP API",
    version: "v1",
    documentation_url: `${origin}/api/v1/openapi.json`,
    endpoints: {
      create: "POST /api/v1/otp/create",
      list: "GET /api/v1/otp/emails",
      latest: "GET /api/v1/otp/latest?email=<address>",
      wait: "GET /api/v1/otp/wait?email=<address>&timeout=60",
      export: "POST /api/v1/otp/export",
    },
  })
}
