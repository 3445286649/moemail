import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { parseDomainList, resolveActiveEmailDomains } from "@/lib/domain-config"

export const runtime = "edge"

export async function GET() {
  const env = getRequestContext().env
  const [domainString, activeDomainString] = await Promise.all([
    env.SITE_CONFIG.get("EMAIL_DOMAINS"),
    env.SITE_CONFIG.get("ACTIVE_EMAIL_DOMAINS"),
  ])
  const allDomains = parseDomainList(domainString || "moemail.app")
  const domains = resolveActiveEmailDomains(domainString || "moemail.app", activeDomainString)
  return NextResponse.json({ domains, activeDomains: domains, allDomains })
}
