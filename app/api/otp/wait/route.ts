import { NextResponse } from "next/server"

export const runtime = "edge"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const timeout = Math.min(Math.max(Number(url.searchParams.get("timeout") || 120), 1), 120)
  const interval = Math.min(Math.max(Number(url.searchParams.get("interval") || 3), 1), 10)
  const deadline = Date.now() + timeout * 1000

  while (Date.now() <= deadline) {
    const latestUrl = new URL("/api/otp/latest", url.origin)
    latestUrl.searchParams.set("email", url.searchParams.get("email") || "")
    const res = await fetch(latestUrl, { headers: request.headers })
    const data = await res.json() as { code?: string | null }
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    if (data.code) return NextResponse.json({ ...data, waited: Math.max(0, timeout - Math.ceil((deadline - Date.now()) / 1000)) })
    await new Promise(resolve => setTimeout(resolve, interval * 1000))
  }

  return NextResponse.json({ error: "等待超时，暂未收到验证码", code: null }, { status: 408 })
}
