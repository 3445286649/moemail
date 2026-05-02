import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getUserId } from "@/lib/apiKey"
import { parseDomainList, resolveActiveEmailDomains } from "@/lib/domain-config"

export const runtime = "edge"

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 })

  const env = getRequestContext().env
  const [domainString, activeDomainString] = await Promise.all([
    env.SITE_CONFIG.get("EMAIL_DOMAINS"),
    env.SITE_CONFIG.get("ACTIVE_EMAIL_DOMAINS"),
  ])
  const allDomains = parseDomainList(domainString || "moemail.app")
  const domains = resolveActiveEmailDomains(domainString || "moemail.app", activeDomainString)
  const [emailCount, messageCount, latest] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM email WHERE userId = ? AND expires_at > ?").bind(userId, Date.now()).first<{ count: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(message_count), 0) AS count FROM email WHERE userId = ?").bind(userId).first<{ count: number }>(),
    env.DB.prepare("SELECT MAX(latest_received_at) AS latest FROM email WHERE userId = ?").bind(userId).first<{ latest: number | null }>(),
  ])

  return NextResponse.json({
    domains,
    activeDomains: domains,
    allDomains,
    checks: [
      { key: "domain_config", label: "启用域名", status: domains.length ? "ok" : "error", detail: domains.join(", ") || "未启用" },
      { key: "d1", label: "D1 数据库", status: "ok", detail: `${emailCount?.count || 0} 个邮箱 / ${messageCount?.count || 0} 封邮件` },
      { key: "worker", label: "收信 Worker", status: latest?.latest ? "ok" : "warn", detail: latest?.latest ? `最近收信 ${new Date(latest.latest).toLocaleString()}` : "暂无真实收信记录" },
    ]
  })
}
