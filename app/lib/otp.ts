export type OtpProvider = "openai" | "microsoft" | "generic" | "unknown"

export interface OtpExtractionInput {
  subject?: string | null
  content?: string | null
  html?: string | null
  from?: string | null
}

export interface OtpExtractionResult {
  code: string | null
  provider: OtpProvider
  confidence: number
  source: "subject" | "content" | "html" | "none"
  matchedText?: string
}

const OPENAI_HINTS = [
  "openai",
  "chatgpt",
  "临时chatgpt验证码",
  "verification code",
  "验证码",
]

const MICROSOFT_HINTS = [
  "microsoft",
  "hotmail",
  "outlook",
  "security code",
  "single-use code",
]

export function normalizeMailText(input: OtpExtractionInput) {
  const htmlText = stripHtml(input.html || "")
  return [input.subject, input.from, input.content, htmlText]
    .filter(Boolean)
    .join("\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r]+/g, " ")
}

export function detectOtpProvider(input: OtpExtractionInput): OtpProvider {
  const text = normalizeMailText(input).toLowerCase()
  if (OPENAI_HINTS.some(hint => text.includes(hint))) return "openai"
  if (MICROSOFT_HINTS.some(hint => text.includes(hint))) return "microsoft"
  return "generic"
}

export function extractOtp(input: OtpExtractionInput): OtpExtractionResult {
  const provider = detectOtpProvider(input)
  const candidates: Array<{ source: OtpExtractionResult["source"], text: string }> = [
    { source: "subject", text: input.subject || "" },
    { source: "content", text: input.content || "" },
    { source: "html", text: stripHtml(input.html || "") },
  ]

  const providerHints = provider === "openai" ? OPENAI_HINTS : provider === "microsoft" ? MICROSOFT_HINTS : []

  for (const item of candidates) {
    const strong = findContextualCode(item.text, providerHints)
    if (strong) {
      return {
        code: strong.code,
        provider,
        confidence: provider === "generic" ? 0.78 : 0.96,
        source: item.source,
        matchedText: strong.context,
      }
    }
  }

  const joined = normalizeMailText(input)
  const fallback = findAnySixDigitCode(joined)
  if (fallback) {
    return {
      code: fallback.code,
      provider,
      confidence: provider === "generic" ? 0.62 : 0.82,
      source: "content",
      matchedText: fallback.context,
    }
  }

  return { code: null, provider: provider === "generic" ? "unknown" : provider, confidence: 0, source: "none" }
}

function findContextualCode(text: string, hints: string[]) {
  if (!text) return null
  const compact = text.replace(/\s+/g, " ")
  const patterns = [
    /(?:code|验证码|驗證碼|security code|verification code|一次性代码|一次性验证码)[^0-9]{0,80}(\d[\d\s-]{4,10}\d)/i,
    /(\d[\d\s-]{4,10}\d)[^a-zA-Z0-9]{0,40}(?:code|验证码|驗證碼)/i,
  ]

  for (const pattern of patterns) {
    const match = compact.match(pattern)
    const code = normalizeCode(match?.[1])
    if (code) return { code, context: sliceContext(compact, match?.index || 0) }
  }

  if (hints.some(h => compact.toLowerCase().includes(h.toLowerCase()))) {
    return findAnySixDigitCode(compact)
  }

  return null
}

function findAnySixDigitCode(text: string) {
  const compact = text.replace(/\s+/g, " ")
  const matches = [...compact.matchAll(/(?<!\d)(\d{6})(?!\d)/g)]
  const filtered = matches.filter(match => !looksLikeDate(compact, match.index || 0, match[1]))
  const match = filtered[0]
  if (!match) return null
  return { code: match[1], context: sliceContext(compact, match.index || 0) }
}

function normalizeCode(value?: string) {
  if (!value) return null
  const digits = value.replace(/\D/g, "")
  return digits.length === 6 ? digits : null
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function looksLikeDate(text: string, index: number, code: string) {
  const around = text.slice(Math.max(0, index - 12), index + code.length + 12).toLowerCase()
  if (/20\d{4}/.test(code) && /date|time|received|sent|时间|日期/.test(around)) return true
  return false
}

function sliceContext(text: string, index: number) {
  return text.slice(Math.max(0, index - 40), index + 80).trim()
}
