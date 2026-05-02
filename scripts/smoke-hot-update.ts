export {}

const smokeOrigin = (process.env.MOEMAIL_SMOKE_ORIGIN || "https://mail.loucer.cn").replace(/\/$/, "")
const checks = [
  { name: "public health", url: `${smokeOrigin}/api/healthz`, okStatuses: [200] },
  { name: "otp page route", url: `${smokeOrigin}/zh-CN/otp`, okStatuses: [200, 307, 308] },
  { name: "openapi", url: `${smokeOrigin}/api/v1/openapi.json`, okStatuses: [200] },
]

async function main() {
  for (const check of checks) {
    const response = await fetch(check.url, { redirect: "manual" })
    if (!check.okStatuses.includes(response.status)) {
      throw new Error(`${check.name} failed: expected ${check.okStatuses.join(" or ")}, got ${response.status}`)
    }

    if (check.name === "public health") {
      const data = await response.json().catch(() => null) as { status?: string; commit?: string | null } | null
      if (data?.status !== "ok") {
        throw new Error(`public health returned unexpected body: ${JSON.stringify(data)}`)
      }
      console.log(`✅ ${check.name}: ${response.status} commit=${data.commit || "unknown"}`)
      continue
    }

    console.log(`✅ ${check.name}: ${response.status}`)
  }
}

main().catch(error => {
  console.error("❌ Smoke check failed:", error)
  process.exit(1)
})
