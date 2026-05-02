const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const runtime = "edge"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const target = requestUrl.searchParams.get("url")

  if (!target) {
    return new Response("Missing url", { status: 400 })
  }

  let imageUrl: URL
  try {
    imageUrl = new URL(target)
  } catch {
    return new Response("Invalid url", { status: 400 })
  }

  if (!["http:", "https:"].includes(imageUrl.protocol) || isBlockedHost(imageUrl.hostname)) {
    return new Response("Blocked url", { status: 400 })
  }

  const upstream = await fetch(imageUrl.toString(), {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "MoeMail-ImageProxy/1.0",
    },
    redirect: "follow",
  })

  if (!upstream.ok) {
    return new Response("Image fetch failed", { status: upstream.status })
  }

  const contentType = upstream.headers.get("Content-Type") || "application/octet-stream"
  if (!contentType.toLowerCase().startsWith("image/")) {
    return new Response("Unsupported content type", { status: 415 })
  }

  const contentLength = Number(upstream.headers.get("Content-Length") || 0)
  if (contentLength > MAX_IMAGE_BYTES) {
    return new Response("Image too large", { status: 413 })
  }

  const bytes = await upstream.arrayBuffer()
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return new Response("Image too large", { status: 413 })
  }

  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase()

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return true
  }

  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true
  }

  const private172 = host.match(/^172\.(\d+)\./)
  if (private172) {
    const octet = Number(private172[1])
    return octet >= 16 && octet <= 31
  }

  return false
}
