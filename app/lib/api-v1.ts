export const API_V1_VERSION = "v1"

export const API_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  WAIT_TIMEOUT: "WAIT_TIMEOUT",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const

type ApiErrorCode = typeof API_ERROR_CODES[keyof typeof API_ERROR_CODES]

type ApiMeta = {
  version: typeof API_V1_VERSION
  request_id: string
}

function requestId() {
  return crypto.randomUUID()
}

export function apiOk<T>(data: T, init?: ResponseInit) {
  return Response.json({
    success: true,
    data,
    meta: {
      version: API_V1_VERSION,
      request_id: requestId(),
    } satisfies ApiMeta,
  }, init)
}

export function apiError(code: ApiErrorCode, message: string, status = 400, details?: unknown) {
  return Response.json({
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      version: API_V1_VERSION,
      request_id: requestId(),
    } satisfies ApiMeta,
  }, { status })
}

export function codeFromStatus(status: number) {
  if (status === 401) return API_ERROR_CODES.UNAUTHORIZED
  if (status === 403) return API_ERROR_CODES.FORBIDDEN
  if (status === 404) return API_ERROR_CODES.NOT_FOUND
  if (status === 409) return API_ERROR_CODES.CONFLICT
  if (status === 408) return API_ERROR_CODES.WAIT_TIMEOUT
  if (status >= 500) return API_ERROR_CODES.INTERNAL_ERROR
  return API_ERROR_CODES.VALIDATION_ERROR
}

export function getPublicOrigin(request: Request) {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const host = forwardedHost || url.host
  const protocol = forwardedProto || url.protocol.replace(":", "")

  if (host === "moemail-gray.pages.dev" || host.endsWith(".moemail-gray.pages.dev")) {
    return "https://mail.loucer.cn"
  }

  return `${protocol}://${host}`
}

export async function wrapJsonResponse<T>(
  response: Response,
  mapData: (data: any) => T | Promise<T> = data => data as T,
) {
  const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
  if (!response.ok) {
    return apiError(codeFromStatus(response.status), data?.error || data?.message || "请求失败", response.status, data)
  }
  return apiOk(await mapData(data), { status: response.status })
}

export function cloneJsonRequest(request: Request, path: string, body: unknown) {
  const url = new URL(request.url)
  url.pathname = path
  return new Request(url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
  })
}

export function cloneGetRequest(request: Request, path: string) {
  const url = new URL(request.url)
  url.pathname = path
  return new Request(url, {
    method: "GET",
    headers: request.headers,
  })
}
