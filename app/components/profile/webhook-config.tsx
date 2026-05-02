/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Send, ChevronDown, ChevronUp } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface WebhookDelivery {
  id: string
  status: string
  event: string
  httpStatus?: number | null
  attempts: number
  durationMs?: number | null
  error?: string | null
  createdAt: string | number | Date
}

export function WebhookConfig() {
  const t = useTranslations("profile.webhook")
  const tCommon = useTranslations("common.actions")
  const tMessages = useTranslations("emails.messages")
  const tApiKey = useTranslations("profile.apiKey")
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [showDocs, setShowDocs] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    Promise.all([
      fetch("/api/webhook")
        .then(res => res.json() as Promise<{ enabled: boolean; url: string }>)
        .then(data => {
          setEnabled(data.enabled)
          setUrl(data.url)
        }),
      fetchDeliveries(),
    ])
      .catch(console.error)
      .finally(() => setInitialLoading(false))
  }, [])

  const fetchDeliveries = async () => {
    const res = await fetch("/api/webhook/deliveries?limit=10")
    const data = await res.json().catch(() => ({})) as { deliveries?: WebhookDelivery[] }
    if (res.ok) setDeliveries(data.deliveries || [])
  }

  if (initialLoading) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{tMessages("loading")}</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setLoading(true)
    try {
      const res = await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, enabled })
      })

      if (!res.ok) throw new Error(t("saveFailed"))

      toast({
        title: t("saveSuccess"),
        description: t("saveSuccess")
      })
    } catch (_error) {
      toast({
        title: t("saveFailed"),
        description: t("saveFailed"),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!url) return

    setTesting(true)
    try {
      const res = await fetch("/api/webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      })

      if (!res.ok) throw new Error(t("testFailed"))

      toast({
        title: t("testSuccess"),
        description: t("testSuccess")
      })
      await fetchDeliveries()
    } catch (_error) {
      toast({
        title: t("testFailed"),
        description: t("testFailed"),
        variant: "destructive"
      })
    } finally {
      setTesting(false)
    }
  }

  const retryDelivery = async (id: string) => {
    setRetryingId(id)
    try {
      const res = await fetch(`/api/webhook/deliveries/${id}/retry`, { method: "POST" })
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error || "Retry failed")
      toast({ title: "Webhook 已重发", description: "投递成功" })
      await fetchDeliveries()
    } catch (error) {
      toast({
        title: "Webhook 重发失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive"
      })
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>{t("enable")}</Label>
          <div className="text-sm text-muted-foreground">
            {t("description")}
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t("url")}</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-url"
                placeholder={t("urlPlaceholder")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                type="url"
                required
              />
              <Button type="submit" disabled={loading} className="flex-shrink-0">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  tCommon("save")
                )}
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTest}
                      disabled={testing || !url}
                    >
                      {testing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("test")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("description2")}
            </p>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">最近投递</div>
              <Button type="button" variant="ghost" size="sm" onClick={fetchDeliveries}>刷新</Button>
            </div>
            <div className="space-y-2">
              {deliveries.map(item => (
                <div key={item.id} className="rounded-md bg-background p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={item.status === "success" ? "text-emerald-600" : "text-red-600"}>
                      {item.status === "success" ? "成功" : "失败"} · {item.httpStatus || "no-status"} · {item.attempts} 次
                    </span>
                    <span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                  {item.error && <div className="mt-1 truncate text-muted-foreground">{item.error}</div>}
                  {item.status !== "success" && (
                    <Button type="button" variant="outline" size="sm" className="mt-2 h-7" disabled={retryingId === item.id} onClick={() => retryDelivery(item.id)}>
                      {retryingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "重发"}
                    </Button>
                  )}
                </div>
              ))}
              {!deliveries.length && <div className="text-xs text-muted-foreground">暂无投递记录。</div>}
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowDocs(!showDocs)}
            >
              {showDocs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {t("description3")}
            </button>

            {showDocs && (
              <div className="rounded-md bg-muted p-4 text-sm space-y-3">
                <p>{t("docs.intro")}</p>
                <pre className="bg-background p-2 rounded text-xs">
                  Content-Type: application/json{'\n'}
                  X-Webhook-Event: new_message
                </pre>

                <p>{t("docs.exampleBody")}</p>
                <pre className="bg-background p-2 rounded text-xs overflow-auto">
                  {`{
  "emailId": "email-uuid",
  "messageId": "message-uuid",
  "fromAddress": "sender@example.com",
  "subject": "${t("docs.subject")}",
  "content": "${t("docs.content")}",
  "html": "${t("docs.html")}",
  "receivedAt": "2024-01-01T12:00:00.000Z",
  "toAddress": "your-email@${window.location.host}"
}`}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  )
} 
