import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

async function assertOwnedBatch(env: ReturnType<typeof getRequestContext>["env"], userId: string, id: string) {
  return env.DB.prepare("SELECT id, name FROM otp_batch WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ id: string; name: string }>()
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({})) as { used?: boolean; name?: string }
  const env = getRequestContext().env
  const batch = await assertOwnedBatch(env, userId, id)
  if (!batch) return NextResponse.json({ error: "批次不存在或无权限" }, { status: 404 })

  const now = Date.now()
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80)
    if (!name) return NextResponse.json({ error: "批次名不能为空" }, { status: 400 })
    await env.DB.prepare("UPDATE otp_batch SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(name, now, id, userId)
      .run()
  }

  if (typeof body.used === "boolean") {
    await env.DB.prepare("UPDATE email SET used = ?, updated_at = ? WHERE batch_id = ? AND userId = ?")
      .bind(body.used ? 1 : 0, now, id, userId)
      .run()
    await env.DB.prepare("UPDATE otp_batch SET updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(now, id, userId)
      .run()
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({})) as { confirm?: boolean }
  const env = getRequestContext().env
  const batch = await assertOwnedBatch(env, userId, id)
  if (!batch) return NextResponse.json({ error: "批次不存在或无权限" }, { status: 404 })

  const preview = await env.DB.prepare(`
    SELECT
      COUNT(*) AS email_count,
      SUM((SELECT COUNT(*) FROM message m WHERE m.emailId = e.id)) AS message_count
    FROM email e
    WHERE e.batch_id = ? AND e.userId = ?
  `).bind(id, userId).first<{ email_count: number; message_count: number }>()

  if (!body.confirm) {
    return NextResponse.json({
      preview: {
        batchId: id,
        batchName: batch.name,
        emailCount: Number(preview?.email_count || 0),
        messageCount: Number(preview?.message_count || 0),
      }
    })
  }

  const idsResult = await env.DB.prepare("SELECT id FROM email WHERE batch_id = ? AND userId = ? LIMIT 500")
    .bind(id, userId)
    .all<{ id: string }>()
  const ids = (idsResult.results || []).map(row => row.id)

  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",")
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM message WHERE emailId IN (${placeholders})`).bind(...ids),
      env.DB.prepare(`DELETE FROM email WHERE id IN (${placeholders})`).bind(...ids),
    ])
  }
  await env.DB.prepare("DELETE FROM otp_batch WHERE id = ? AND user_id = ?").bind(id, userId).run()

  return NextResponse.json({ success: true, deleted: ids.length })
}
