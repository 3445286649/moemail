"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { CreateDialog } from "./create-dialog"
import { ShareDialog } from "./share-dialog"
import { Clock3, Copy, Mail, RefreshCw, Search, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useThrottle } from "@/hooks/use-throttle"
import { EMAIL_CONFIG } from "@/config"
import { useToast } from "@/components/ui/use-toast"
import { useCopy } from "@/hooks/use-copy"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ROLES } from "@/lib/permissions"
import { useUserRole } from "@/hooks/use-user-role"
import { useConfig } from "@/hooks/use-config"
import { type MailboxEmail, useMailboxStore } from "@/stores/mailbox-store"

type Email = MailboxEmail

interface EmailListProps {
  onEmailSelect: (email: Email | null) => void
  selectedEmailId?: string
}

interface EmailResponse {
  emails: Email[]
  nextCursor: string | null
  total: number
  version: number
}

export function EmailList({ onEmailSelect, selectedEmailId }: EmailListProps) {
  const { data: session } = useSession()
  const { config } = useConfig()
  const { role } = useUserRole()
  const t = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const {
    emails,
    emailNextCursor,
    emailTotal,
    emailListKey,
    emailOwnerId,
    emailVersion,
    emailLastSyncAt,
    hydrated,
    setEmails,
    removeEmail,
    resetForOwner,
  } = useMailboxStore()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [query, setQuery] = useState("")
  const [recentOnly, setRecentOnly] = useState(false)
  const [emailToDelete, setEmailToDelete] = useState<Email | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(560)
  const [sseActive, setSseActive] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null)
  const requestSeqRef = useRef(0)
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()
  const deferredQuery = useDeferredValue(query)
  const sessionUserId = session?.user?.id || null

  const buildListUrl = useCallback((cursor?: string) => {
    const url = new URL("/api/emails", window.location.origin)
    url.searchParams.set("limit", "50")
    if (deferredQuery.trim()) url.searchParams.set("q", deferredQuery.trim())
    if (recentOnly) url.searchParams.set("recentOnly", "1")
    if (cursor) url.searchParams.set("cursor", cursor)
    return url
  }, [deferredQuery, recentOnly])

  const currentListKey = useMemo(() => {
    const params = new URLSearchParams()
    if (deferredQuery.trim()) params.set("q", deferredQuery.trim())
    if (recentOnly) params.set("recentOnly", "1")
    return params.toString()
  }, [deferredQuery, recentOnly])

  const fetchEmails = useCallback(async (cursor?: string, options?: { silent?: boolean }) => {
    const requestId = requestSeqRef.current + 1
    requestSeqRef.current = requestId
    requestRef.current?.controller.abort()
    const controller = new AbortController()
    requestRef.current = { id: requestId, controller }

    if (!cursor && !options?.silent) setLoading(true)
    try {
      const url = buildListUrl(cursor)
      const response = await fetch(url, { signal: controller.signal })
      const data = await response.json() as EmailResponse
      if (requestRef.current?.id !== requestId) return

      setEmails({
        emails: data.emails || [],
        nextCursor: data.nextCursor,
        total: data.total,
        listKey: currentListKey,
        ownerId: sessionUserId || "",
        version: data.version || Date.now(),
        append: Boolean(cursor),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.error("Failed to fetch emails:", error)
    } finally {
      if (requestRef.current?.id !== requestId) return
      requestRef.current = null
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [buildListUrl, currentListKey, sessionUserId, setEmails])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchEmails()
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
    if (loadingMore) return
    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && emailNextCursor) {
      setLoadingMore(true)
      fetchEmails(emailNextCursor, { silent: true })
    }
  }, 200)

  useEffect(() => {
    const node = listRef.current
    if (!node || typeof ResizeObserver === "undefined") return
    setViewportHeight(node.clientHeight || 560)
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(Math.max(240, Math.floor(entry.contentRect.height)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!sessionUserId || !hydrated) return
    if (emailOwnerId !== sessionUserId) {
      resetForOwner(sessionUserId)
      void fetchEmails()
      return
    }
    const stale = !emailLastSyncAt || Date.now() - emailLastSyncAt > 30000
    if (emailListKey !== currentListKey || stale) {
      void fetchEmails(undefined, { silent: Boolean(emails.length) })
    } else {
      setLoading(false)
    }
  }, [currentListKey, emailLastSyncAt, emailListKey, emailOwnerId, emails.length, fetchEmails, hydrated, resetForOwner, sessionUserId])

  useEffect(() => {
    if (!session || !hydrated || typeof window === "undefined" || !("EventSource" in window)) return
    let closed = false
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      if (closed || document.visibilityState === "hidden") return
      source = new EventSource(`/api/otp/events?after=${emailVersion}`)
      source.addEventListener("ready", () => {
        setSseActive(true)
      })
      source.addEventListener("ping", () => {
        setSseActive(true)
      })
      source.addEventListener("state", (event) => {
        setSseActive(true)
        const data = JSON.parse((event as MessageEvent).data) as { version: number }
        if (data.version > emailVersion) {
          void fetchEmails(undefined, { silent: true })
        }
      })
      source.addEventListener("close", () => {
        setSseActive(false)
        source?.close()
        source = null
        if (!closed) reconnectTimer = setTimeout(connect, 1500)
      })
      source.onerror = () => {
        setSseActive(false)
        source?.close()
        source = null
        if (!closed) reconnectTimer = setTimeout(connect, 5000)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        setSseActive(false)
        source?.close()
        source = null
        return
      }
      connect()
      void fetchEmails(undefined, { silent: true })
    }

    connect()
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      closed = true
      setSseActive(false)
      source?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [emailVersion, fetchEmails, hydrated, session])

  const handleDelete = async (email: Email) => {
    try {
      const response = await fetch(`/api/emails/${email.id}`, { method: "DELETE" })
      if (!response.ok) {
        const data = await response.json()
        toast({ title: t("error"), description: (data as { error: string }).error, variant: "destructive" })
        return
      }

      removeEmail(email.id)
      toast({ title: t("success"), description: t("deleteSuccess") })
      if (selectedEmailId === email.id) onEmailSelect(null)
    } catch {
      toast({ title: t("error"), description: t("deleteFailed"), variant: "destructive" })
    } finally {
      setEmailToDelete(null)
    }
  }

  const formatTime = (value?: number | null) => {
    if (!value) return "暂无收信"
    return new Date(value).toLocaleString()
  }

  if (!session) return null

  const rowHeight = 92
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 6)
  const visibleEmails = emails.slice(startIndex, startIndex + Math.ceil(viewportHeight / rowHeight) + 12)

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="p-2 space-y-2 border-b border-primary/20">
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing} className={cn("h-8 w-8", refreshing && "animate-spin")}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <span className="text-xs text-gray-500">
                {role === ROLES.EMPEROR ? t("emailCountUnlimited", { count: emailTotal }) : t("emailCount", { count: emailTotal, max: config?.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS })}
                <span className="ml-2 text-[10px] text-primary/70">{sseActive ? "实时" : "缓存"}</span>
              </span>
            </div>
            <CreateDialog onEmailCreated={handleRefresh} />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索邮箱" className="h-8 pl-8 text-xs" />
          </div>
          <label className="flex items-center justify-between rounded-lg bg-muted/40 px-2 py-1.5 text-xs">
            <span>只看最近 24 小时有邮件</span>
            <Switch checked={recentOnly} onCheckedChange={setRecentOnly} />
          </label>
        </div>

        <div ref={listRef} className="flex-1 overflow-auto p-2" onScroll={handleScroll}>
          {loading ? (
            <div className="text-center text-sm text-gray-500">{t("loading")}</div>
          ) : emails.length > 0 ? (
            <div className="relative" style={{ height: emails.length * rowHeight }}>
              <div className="absolute left-0 right-0 space-y-1" style={{ transform: `translateY(${startIndex * rowHeight}px)` }}>
              {visibleEmails.map(email => (
                <div
                  key={email.id}
                  style={{ height: rowHeight - 4 }}
                  className={cn("flex items-start gap-2 overflow-hidden p-2 rounded cursor-pointer text-sm group", "hover:bg-primary/5", selectedEmailId === email.id && "bg-primary/10")}
                  onClick={() => onEmailSelect(email)}
                >
                  <Mail className="h-4 w-4 text-primary/60 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <div className="font-medium truncate">{email.address}</div>
                      <button onClick={(e) => { e.stopPropagation(); copyToClipboard(email.address) }} className="opacity-0 group-hover:opacity-100 text-primary">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span>{email.messageCount || 0} 封</span>
                      <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatTime(email.latestReceivedAt)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold tracking-widest", email.latestCode ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{email.latestCode || "------"}</span>
                      <span className="truncate text-xs text-muted-foreground">{email.latestSubject || (new Date(email.expiresAt).getFullYear() === 9999 ? t("permanent") : `${t("expiresAt")}: ${new Date(email.expiresAt).toLocaleString()}`)}</span>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <ShareDialog emailId={email.id} emailAddress={email.address} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEmailToDelete(email) }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              </div>
              {loadingMore && <div className="text-center text-sm text-gray-500 py-2">{t("loadingMore")}</div>}
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500">{t("noEmails")}</div>
          )}
        </div>
      </div>

      <AlertDialog open={!!emailToDelete} onOpenChange={() => setEmailToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription", { email: emailToDelete?.address || "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => emailToDelete && handleDelete(emailToDelete)}>
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
