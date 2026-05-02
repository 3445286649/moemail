import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

interface OtpUserStateRow {
  version?: number | null
  total?: number | null
  message_count?: number | null
  code_count?: number | null
  received_count?: number | null
  empty_count?: number | null
  used_count?: number | null
  latest_received_at?: number | null
}

const encoder = new TextEncoder()

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function eventChunk(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function toSummary(row?: OtpUserStateRow | null) {
  return {
    version: Number(row?.version || 0),
    total: Number(row?.total || 0),
    messageCount: Number(row?.message_count || 0),
    codeCount: Number(row?.code_count || 0),
    receivedCount: Number(row?.received_count || 0),
    emptyCount: Number(row?.empty_count || 0),
    usedCount: Number(row?.used_count || 0),
    latestReceivedAt: Number(row?.latest_received_at || 0) || null,
    statusCounts: {
      all: Number(row?.total || 0),
      new: Number(row?.received_count || 0),
      code: Number(row?.code_count || 0),
      empty: Number(row?.empty_count || 0),
      used: Number(row?.used_count || 0),
    },
  }
}

async function readState(env: ReturnType<typeof getRequestContext>["env"], userId: string) {
  const row = await env.DB.prepare(`
    SELECT
      version,
      total,
      message_count,
      code_count,
      received_count,
      empty_count,
      used_count,
      latest_received_at
    FROM otp_user_state
    WHERE user_id = ?
  `).bind(userId).first<OtpUserStateRow>()
  return toSummary(row)
}

export async function GET(request: Request) {
  const userId = await getUserId()
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 })

  const env = getRequestContext().env
  const { searchParams } = new URL(request.url)
  let version = Number(searchParams.get("after") || 0)
  let closed = false

  request.signal.addEventListener("abort", () => {
    closed = true
  })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(eventChunk("ready", { version }))
      const deadline = Date.now() + 55_000

      while (!closed && Date.now() < deadline) {
        const summary = await readState(env, userId)
        if (summary.version > version) {
          version = summary.version
          controller.enqueue(eventChunk("state", summary))
        } else {
          controller.enqueue(eventChunk("ping", { version, ts: Date.now() }))
        }
        await sleep(3000)
      }

      controller.enqueue(eventChunk("close", { version }))
      controller.close()
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
