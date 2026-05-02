import { auth } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { webhookDeliveries } from "@/lib/schema"
import { desc, eq } from "drizzle-orm"

export const runtime = "edge"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 50)
  const db = createDb()
  const rows = await db.query.webhookDeliveries.findMany({
    where: eq(webhookDeliveries.userId, session.user.id),
    orderBy: [desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id)],
    limit,
  })

  return Response.json({ deliveries: rows })
}
