#!/usr/bin/env node

const baseUrl = (process.env.MOEMAIL_BASE_URL || "https://mail.loucer.cn").replace(/\/$/, "")
const apiKey = process.env.MOEMAIL_API_KEY

if (!apiKey) {
  console.error("MOEMAIL_API_KEY is required")
  process.exit(1)
}

const [command, ...args] = process.argv.slice(2)

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(init.headers || {}),
    },
  })
  const payload = await response.json()
  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message || `request failed: ${response.status}`)
  }
  return payload.data
}

async function main() {
  if (command === "create") {
    const [domain, count = "1", prefix = ""] = args
    const data = await request("/api/v1/otp/create", {
      method: "POST",
      body: JSON.stringify({ domain, count: Number(count), prefix }),
    })
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (command === "latest") {
    const [email] = args
    const data = await request(`/api/v1/otp/latest?email=${encodeURIComponent(email)}`)
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (command === "wait") {
    const [email, timeout = "60"] = args
    const data = await request(`/api/v1/otp/wait?email=${encodeURIComponent(email)}&timeout=${timeout}`)
    console.log(JSON.stringify(data, null, 2))
    return
  }

  console.log(`Usage:
  MOEMAIL_API_KEY=mk_xxx node examples/cli/moemail.mjs create intereloucer.com 3 openai
  MOEMAIL_API_KEY=mk_xxx node examples/cli/moemail.mjs latest user@intereloucer.com
  MOEMAIL_API_KEY=mk_xxx node examples/cli/moemail.mjs wait user@intereloucer.com 60`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
