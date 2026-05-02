"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Copy, Loader2 } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useTheme } from "next-themes"
import { extractOtp } from "@/lib/otp"
import { useCopy } from "@/hooks/use-copy"
import { emailFrameStyles, prepareEmailHtml } from "@/lib/email-html"

interface MessageDetail {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  content?: string
  html?: string
  received_at?: number
  sent_at?: number
}

interface SharedMessageDetailProps {
  message: MessageDetail | null
  loading?: boolean
  t: {
    messageContent: string
    selectMessage: string
    loading: string
    from: string
    to: string
    subject: string
    time: string
    htmlFormat: string
    textFormat: string
  }
}

type ViewMode = "html" | "text"

export function SharedMessageDetail({
  message,
  loading = false,
  t,
}: SharedMessageDetailProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("html")
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { resolvedTheme } = useTheme()
  const { copyToClipboard } = useCopy()

  // 如果没有HTML内容，默认显示文本
  useEffect(() => {
    if (message) {
      if (!message.html && message.content) {
        setViewMode("text")
      } else if (message.html) {
        setViewMode("html")
      }
    }
  }, [message])

  const updateIframeContent = useCallback(() => {
    if (viewMode === "html" && message?.html && iframeRef.current) {
      const iframe = iframeRef.current
      const doc = iframe.contentDocument || iframe.contentWindow?.document

      if (doc) {
        const isDark = resolvedTheme === "dark"
        const preparedHtml = prepareEmailHtml(message.html)

        doc.open()
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta name="referrer" content="no-referrer">
              <base target="_blank">
              ${preparedHtml.head}
              <style>${emailFrameStyles(isDark)}</style>
            </head>
            <body data-mail-theme="${isDark ? "dark" : "light"}">${preparedHtml.body}</body>
          </html>
        `)
        doc.close()

        const updateHeight = () => {
          const container = iframe.parentElement
          if (container) {
            iframe.style.height = `${container.clientHeight}px`
          }
        }

        updateHeight()
        window.addEventListener("resize", updateHeight)

        const resizeObserver = new ResizeObserver(updateHeight)
        resizeObserver.observe(doc.body)

        doc.querySelectorAll("img").forEach((img: HTMLImageElement) => {
          img.onload = updateHeight
        })

        return () => {
          window.removeEventListener("resize", updateHeight)
          resizeObserver.disconnect()
        }
      }
    }
  }, [message?.html, resolvedTheme, viewMode])

  useEffect(() => {
    return updateIframeContent()
  }, [updateIframeContent])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-primary/60" />
        <span className="ml-2 text-sm text-gray-500">{t.loading}</span>
      </div>
    )
  }

  if (!message) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        {t.selectMessage}
      </div>
    )
  }

  const otp = extractOtp({
    subject: message.subject,
    content: message.content,
    html: message.html,
    from: message.from_address,
  })

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 space-y-3 border-b border-primary/20">
        {otp.code && (
          <button
            onClick={() => copyToClipboard(otp.code || "")}
            className="w-full rounded-2xl border border-primary/25 bg-primary/10 p-4 text-left transition hover:bg-primary/15"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">自动识别验证码 · {otp.provider}</div>
                <div className="mt-1 text-4xl font-black tracking-[0.18em] text-primary">{otp.code}</div>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 text-xs text-primary">
                <Copy className="h-3.5 w-3.5" /> 复制
              </div>
            </div>
          </button>
        )}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold flex-1">{message.subject}</h3>
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          {message.from_address && (
            <p>
              {t.from}: {message.from_address}
            </p>
          )}
          {message.to_address && (
            <p>
              {t.to}: {message.to_address}
            </p>
          )}
          <p>
            {t.time}:{" "}
            {new Date(
              message.sent_at || message.received_at || 0
            ).toLocaleString()}
          </p>
        </div>
      </div>

      {message.html && message.content && (
        <div className="border-b border-primary/20 p-2">
          <RadioGroup
            value={viewMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
            className="flex items-center gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="html" id="html" />
              <Label htmlFor="html" className="text-xs cursor-pointer">
                {t.htmlFormat}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="text" id="text" />
              <Label htmlFor="text" className="text-xs cursor-pointer">
                {t.textFormat}
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      <div className="flex-1 overflow-auto relative">
        {viewMode === "html" && message.html ? (
          <iframe
            ref={iframeRef}
            className="absolute inset-0 w-full h-full border-0 bg-white"
            sandbox="allow-same-origin allow-popups"
          />
        ) : message.content ? (
          <div className="p-4 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            {t.selectMessage}
          </div>
        )}
      </div>
    </div>
  )
}
