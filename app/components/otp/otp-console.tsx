"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/use-toast"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { LanguageSwitcher } from "@/components/layout/language-switcher"
import { TopModeSwitcher } from "@/components/layout/top-mode-switcher"
import { cn } from "@/lib/utils"
import { useCopy } from "@/hooks/use-copy"
import {
  type HealthCheck,
  type OtpBatch,
  type OtpEmail,
  type OtpListSummary,
  type OtpPagination,
  useOtpConsoleStore,
} from "@/stores/otp-console-store"
import {
  Activity,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  FileCode2,
  Filter,
  Gauge,
  Inbox,
  Mail,
  MailCheck,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react"

type CreateMode = "human" | "numeric" | "prefix"
type UsedFilter = "all" | "used" | "unused"
type CleanupMode = "test" | "empty" | "olderThan"
type StatusFilter = "all" | "new" | "code" | "empty" | "used"
type SortOption = "activity_desc" | "created_desc" | "created_asc" | "code_first" | "used_first"

interface CleanupPreview {
  mode: CleanupMode
  count: number
  emails: Array<{
    id: string
    address: string
    createdAt: number
    messageCount: number
    latestReceivedAt?: number | null
  }>
}

interface OtpUpdateProbe extends OtpListSummary {
  changed: boolean
}

interface OtpConsoleProps {
  locale: string
  user?: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

const cleanupLabels: Record<CleanupMode, string> = {
  test: "测试邮箱",
  empty: "空邮箱",
  olderThan: "超过 N 天无新邮件",
}

const statusFilterItems: Array<{ key: StatusFilter; label: string; icon: typeof Inbox }> = [
  { key: "all", label: "全部邮箱", icon: Inbox },
  { key: "new", label: "有新邮件", icon: MailCheck },
  { key: "code", label: "含验证码", icon: Circle },
  { key: "empty", label: "无邮件", icon: Circle },
  { key: "used", label: "已使用", icon: CheckCircle2 },
]

const sortLabels: Record<SortOption, string> = {
  activity_desc: "最近活动",
  created_desc: "最新创建",
  created_asc: "最早创建",
  code_first: "验证码优先",
  used_first: "已用优先",
}

function splitTags(value: string) {
  return Array.from(new Set(value
    .split(/[，,\s]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)))
    .slice(0, 8)
}

function getDomain(address: string) {
  return address.split("@")[1] || ""
}

function formatRelativeTime(value?: number | null) {
  if (!value) return "暂无"
  const diff = Date.now() - value
  const minutes = Math.max(0, Math.round(diff / 60000))
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}

function formatClock(value?: number | null) {
  if (!value) return "--:--:--"
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false })
}

function compactNumber(value: number) {
  return value.toLocaleString("en-US")
}

export function OtpConsole({ locale, user }: OtpConsoleProps) {
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()
  const {
    emails,
    batches,
    domains,
    health,
    summary,
    pagination,
    listKey,
    listVersion,
    lastSyncAt,
    lastStaticSyncAt,
    hydrated,
    setEmails,
    setSummary,
    setBatches,
    setDomains,
    setHealth,
  } = useOtpConsoleStore()
  const [query, setQuery] = useState("")
  const [recentOnly, setRecentOnly] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [createCount, setCreateCount] = useState(1)
  const [createMode, setCreateMode] = useState<CreateMode>("human")
  const [prefix, setPrefix] = useState("")
  const [createDomain, setCreateDomain] = useState("")
  const [batchName, setBatchName] = useState("")
  const [createTags, setCreateTags] = useState("OpenAI")
  const [tagFilter, setTagFilter] = useState("")
  const [domainFilter, setDomainFilter] = useState("all")
  const [batchFilter, setBatchFilter] = useState("all")
  const [usedFilter, setUsedFilter] = useState<UsedFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<SortOption>("activity_desc")
  const [cleanupMode, setCleanupMode] = useState<CleanupMode>("empty")
  const [cleanupDays, setCleanupDays] = useState(7)
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const listRequestRef = useRef(false)
  const updateProbeRef = useRef(false)
  const lastHiddenProbeRef = useRef(0)
  const sseActiveRef = useRef(false)

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const latestCode = emails.find(item => item.latestCode)?.latestCode
  const mailCount = summary.messageCount
  const codeCount = summary.codeCount
  const totalEmailCount = summary.total
  const knownTags = useMemo(() => Array.from(new Set(emails.flatMap(item => item.tags || []))).filter(Boolean).sort(), [emails])
  const healthStatus = health.some(item => item.status === "error")
    ? "error"
    : health.some(item => item.status === "warn")
      ? "warn"
      : "ok"
  const healthLabel = health.length ? healthStatus === "error" ? "异常" : healthStatus === "warn" ? "注意" : "正常" : "读取中"
  const domainStats = useMemo(() => {
    const counts = new Map<string, number>()
    emails.forEach(item => counts.set(getDomain(item.address), (counts.get(getDomain(item.address)) || 0) + 1))
    return domains.map(domain => ({ domain, count: counts.get(domain) || 0 }))
  }, [domains, emails])

  const totalPages = Math.max(1, pagination.totalPages || Math.ceil(totalEmailCount / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedEmails = emails
  const pageNumbers = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
    const start = Math.min(Math.max(currentPage - 2, 1), Math.max(totalPages - 4, 1))
    return start + index
  })

  const statusCounts: Record<StatusFilter, number> = {
    all: summary.statusCounts?.all ?? summary.total,
    new: summary.statusCounts?.new ?? summary.receivedCount,
    code: summary.statusCounts?.code ?? summary.codeCount,
    empty: summary.statusCounts?.empty ?? summary.emptyCount,
    used: summary.statusCounts?.used ?? summary.usedCount,
  }

  const buildListQueryParams = useCallback((extra?: Record<string, string | number>) => {
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    if (recentOnly) params.set("recentHours", "24")
    if (tagFilter.trim()) params.set("tag", tagFilter.trim())
    if (domainFilter !== "all") params.set("domain", domainFilter)
    if (batchFilter !== "all") params.set("batchId", batchFilter)
    if (usedFilter === "used") params.set("used", "1")
    if (usedFilter === "unused") params.set("used", "0")
    if (statusFilter !== "all") params.set("status", statusFilter)
    if (sort !== "activity_desc") params.set("sort", sort)
    params.set("limit", String(pageSize))
    params.set("page", String(page))
    Object.entries(extra || {}).forEach(([key, value]) => params.set(key, String(value)))
    return params
  }, [batchFilter, domainFilter, page, pageSize, query, recentOnly, sort, statusFilter, tagFilter, usedFilter])
  const currentListKey = useMemo(() => buildListQueryParams().toString(), [buildListQueryParams])

  const buildListQueryBody = () => ({
    q: query.trim(),
    recentHours: recentOnly ? 24 : 0,
    tag: tagFilter.trim() || undefined,
    batchId: batchFilter !== "all" ? batchFilter : undefined,
    used: usedFilter === "all" ? undefined : usedFilter === "used",
    status: statusFilter !== "all" ? statusFilter : undefined,
    sort,
    limit: 500,
    locale: "zh-CN",
  })

  const downloadMainTxt = async (ids?: string[], extraBody?: Record<string, unknown>) => {
    const targetIds = ids && ids.length ? ids : selected
    if (!targetIds.length && !extraBody) {
      toast({ title: "请选择邮箱", description: "先勾选要导出的邮箱，再下载 mail.txt" })
      return
    }

    setExporting(true)
    try {
      const body = extraBody || { ids: targetIds, locale: "zh-CN" }
      const res = await fetch("/api/otp/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || "导出失败")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "mail.txt"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: "已导出 mail.txt", description: `共 ${res.headers.get("X-Export-Count") || targetIds.length || 0} 个邮箱分享链接` })
    } catch (error) {
      toast({ title: "导出失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  const exportCurrentList = async () => {
    await downloadMainTxt([], buildListQueryBody())
  }

  const fetchEmails = useCallback(async (options?: { silent?: boolean }) => {
    if (listRequestRef.current) return
    listRequestRef.current = true
    if (!options?.silent) setLoading(true)
    try {
      const params = buildListQueryParams()
      const nextListKey = params.toString()
      const emailRes = await fetch(`/api/otp/emails?${params}`)
      const emailData = await emailRes.json() as { error?: string; emails?: OtpEmail[]; summary?: OtpListSummary; pagination?: OtpPagination }
      if (!emailRes.ok) throw new Error(emailData.error || "读取邮箱失败")
      if (!emailData.summary || !emailData.pagination) throw new Error("接口返回缺少分页摘要")
      setEmails(emailData.emails || [], emailData.summary, emailData.pagination, nextListKey)
    } catch (error) {
      toast({ title: "读取失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    } finally {
      listRequestRef.current = false
      if (!options?.silent) setLoading(false)
    }
  }, [buildListQueryParams, setEmails, toast])

  const fetchBatches = useCallback(async () => {
    const res = await fetch("/api/otp/batches")
    const data = await res.json().catch(() => ({})) as { batches?: OtpBatch[] }
    if (res.ok) setBatches(data.batches || [])
  }, [setBatches])

  const fetchDomains = useCallback(async () => {
    const res = await fetch("/api/otp/domains")
    const data = await res.json().catch(() => ({})) as { domains?: string[] }
    if (!res.ok) return
    setDomains(data.domains || [])
    setCreateDomain(current => current || data.domains?.[0] || "")
  }, [setDomains])

  const fetchHealth = useCallback(async () => {
    const res = await fetch("/api/otp/health")
    const data = await res.json().catch(() => ({})) as { checks?: HealthCheck[] }
    if (res.ok) setHealth(data.checks || [])
  }, [setHealth])

  const fetchDashboard = useCallback(async (options?: { silent?: boolean }) => {
    await Promise.all([
      fetchEmails(options),
      fetchBatches(),
      fetchDomains(),
      fetchHealth(),
    ])
  }, [fetchBatches, fetchDomains, fetchEmails, fetchHealth])

  const probeUpdates = useCallback(async () => {
    if (updateProbeRef.current || listRequestRef.current) return
    if (sseActiveRef.current && document.visibilityState === "visible") return
    if (typeof navigator !== "undefined" && !navigator.onLine) return
    const hidden = document.visibilityState === "hidden"
    if (hidden && Date.now() - lastHiddenProbeRef.current < 45000) return
    if (hidden) lastHiddenProbeRef.current = Date.now()

    updateProbeRef.current = true
    try {
      const params = buildListQueryParams({ after: listVersion })
      const res = await fetch(`/api/otp/updates?${params}`)
      const data = await res.json().catch(() => ({})) as Partial<OtpUpdateProbe>
      if (!res.ok) return
      if (Number(data.version || 0) > listVersion && data.changed) {
        if (data.version && data.total !== undefined) setSummary(data as OtpListSummary)
        await fetchEmails({ silent: true })
      }
    } finally {
      updateProbeRef.current = false
    }
  }, [buildListQueryParams, fetchEmails, listVersion, setSummary])

  const refreshNow = useCallback(async () => {
    await fetchDashboard()
  }, [fetchDashboard])

  useEffect(() => {
    setPage(1)
  }, [query, recentOnly, tagFilter, domainFilter, batchFilter, usedFilter, statusFilter, sort])

  useEffect(() => {
    if (!hydrated) return
    const emptyPageNeedsHydration = !emails.length
    if (listKey !== currentListKey || emptyPageNeedsHydration) {
      fetchEmails()
      return
    }
    probeUpdates()
  }, [currentListKey, emails.length, fetchEmails, hydrated, listKey, probeUpdates])

	  useEffect(() => {
	    if (!hydrated) return
	    const staleStatic = !lastStaticSyncAt || Date.now() - lastStaticSyncAt > 5 * 60 * 1000
	    fetchHealth()
	    if (staleStatic) {
	      const timer = window.setTimeout(() => {
	        void fetchBatches()
	        void fetchDomains()
	      }, 900)
	      return () => window.clearTimeout(timer)
	    }
	  }, [fetchBatches, fetchDomains, fetchHealth, hydrated, lastStaticSyncAt])

  useEffect(() => {
    if (!autoRefresh) return
    if (typeof window === "undefined" || !("EventSource" in window)) return

    let closed = false
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      if (closed || document.visibilityState === "hidden") return
      source = new EventSource(`/api/otp/events?after=${listVersion}`)
      source.addEventListener("ready", () => {
        sseActiveRef.current = true
      })
      source.addEventListener("ping", () => {
        sseActiveRef.current = true
      })
      source.addEventListener("state", (event) => {
        sseActiveRef.current = true
        const data = JSON.parse((event as MessageEvent).data) as OtpListSummary
        if (data.version > listVersion) {
          setSummary(data)
          void fetchEmails({ silent: true })
        }
      })
      source.addEventListener("close", () => {
        sseActiveRef.current = false
        source?.close()
        source = null
        if (!closed) reconnectTimer = setTimeout(connect, 1200)
      })
      source.onerror = () => {
        sseActiveRef.current = false
        source?.close()
        source = null
        if (!closed) reconnectTimer = setTimeout(connect, 5000)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        sseActiveRef.current = false
        source?.close()
        source = null
        return
      }
      connect()
      void probeUpdates()
    }

    connect()
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      closed = true
      sseActiveRef.current = false
      source?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [autoRefresh, fetchEmails, listVersion, probeUpdates, setSummary])

  useEffect(() => {
    if (!autoRefresh) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      if (stopped) return
      const delay = document.visibilityState === "hidden" ? 45000 : 8000
      timer = setTimeout(async () => {
        await probeUpdates()
        schedule()
      }, delay)
    }

    const resyncVisible = () => {
      if (timer) clearTimeout(timer)
      if (document.visibilityState === "visible") void probeUpdates()
      schedule()
    }

    schedule()
    document.addEventListener("visibilitychange", resyncVisible)
    window.addEventListener("focus", resyncVisible)

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", resyncVisible)
      window.removeEventListener("focus", resyncVisible)
    }
  }, [autoRefresh, probeUpdates])

  useEffect(() => {
    const timer = setInterval(fetchHealth, 60000)
    return () => clearInterval(timer)
  }, [fetchHealth])

  const createEmails = async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/otp/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: createCount,
          mode: createMode,
          prefix,
          domain: createDomain,
          expiryTime: 0,
          batchName,
          tags: splitTags(createTags),
        }),
      })
      const data = await res.json() as { error?: string; count?: number; created?: Array<{ id: string; email?: string; address?: string }>; batchName?: string }
      if (!res.ok) throw new Error(data.error || "创建失败")
      const createdIds = (data.created || []).map(item => item.id).filter(Boolean)
      toast({ title: "创建成功", description: `已创建 ${data.count || data.created?.length || 1} 个永久邮箱${data.batchName ? `，批次：${data.batchName}` : ""}` })
      setPrefix("")
      setBatchName("")
      await Promise.all([fetchEmails(), fetchBatches(), fetchHealth()])
      if (createdIds.length && window.confirm("已创建完成，是否立即导出 mail.txt？")) {
        await downloadMainTxt(createdIds)
      }
    } catch (error) {
      toast({ title: "创建失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const updateSelected = async (payload: { used?: boolean; tags?: string[] }) => {
    if (!selected.length) return
    try {
      const res = await fetch("/api/otp/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, ...payload }),
      })
      const data = await res.json() as { error?: string; updated?: number }
      if (!res.ok) throw new Error(data.error || "更新失败")
      toast({ title: "已更新", description: `影响 ${data.updated || selected.length} 个邮箱` })
      await fetchEmails()
    } catch (error) {
      toast({ title: "更新失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    }
  }

  const deleteSelected = async () => {
    if (!selected.length) return
    if (!window.confirm(`确定删除选中的 ${selected.length} 个邮箱？该操作会同时删除邮件，不能撤销。`)) return
    try {
      const res = await fetch("/api/otp/emails", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, confirm: true }),
      })
      const data = await res.json() as { error?: string; deleted?: number }
      if (!res.ok) throw new Error(data.error || "删除失败")
      toast({ title: "删除完成", description: `已删除 ${data.deleted || 0} 个邮箱` })
      setSelected([])
      await Promise.all([fetchEmails(), fetchBatches(), fetchHealth()])
    } catch (error) {
      toast({ title: "删除失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    }
  }

  const setBatchUsed = async (batch: OtpBatch, used: boolean) => {
    try {
      const res = await fetch(`/api/otp/batches/${batch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ used }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error || "更新批次失败")
      toast({ title: used ? "已标记为已用" : "已标记为未用", description: batch.name })
      await Promise.all([fetchEmails(), fetchBatches()])
    } catch (error) {
      toast({ title: "批次更新失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    }
  }

  const deleteBatch = async (batch: OtpBatch) => {
    try {
      const previewRes = await fetch(`/api/otp/batches/${batch.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: false }) })
      const previewData = await previewRes.json() as { error?: string; preview?: { emailCount: number; messageCount: number } }
      if (!previewRes.ok) throw new Error(previewData.error || "读取批次预览失败")
      const emailCount = previewData.preview?.emailCount || 0
      const messageCount = previewData.preview?.messageCount || 0
      if (!window.confirm(`确定删除批次「${batch.name}」？将删除 ${emailCount} 个邮箱和 ${messageCount} 封邮件，不能撤销。`)) return
      const res = await fetch(`/api/otp/batches/${batch.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) })
      const data = await res.json() as { error?: string; deleted?: number }
      if (!res.ok) throw new Error(data.error || "删除批次失败")
      toast({ title: "批次已删除", description: `删除 ${data.deleted || 0} 个邮箱` })
      if (batchFilter === batch.id) setBatchFilter("all")
      await Promise.all([fetchEmails(), fetchBatches(), fetchHealth()])
    } catch (error) {
      toast({ title: "批次删除失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    }
  }

  const previewCleanup = async () => {
    setCleaning(true)
    try {
      const res = await fetch("/api/otp/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: cleanupMode, days: cleanupDays, confirm: false }),
      })
      const data = await res.json() as { error?: string; preview?: CleanupPreview }
      if (!res.ok) throw new Error(data.error || "清理预览失败")
      setCleanupPreview(data.preview || null)
      toast({ title: "清理预览已生成", description: `匹配 ${data.preview?.count || 0} 个邮箱` })
    } catch (error) {
      toast({ title: "清理预览失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    } finally {
      setCleaning(false)
    }
  }

  const confirmCleanup = async () => {
    if (!cleanupPreview?.count) return
    if (!window.confirm(`确定删除 ${cleanupPreview.count} 个${cleanupLabels[cleanupMode]}？该操作不能撤销。`)) return
    setCleaning(true)
    try {
      const res = await fetch("/api/otp/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: cleanupMode, days: cleanupDays, confirm: true }),
      })
      const data = await res.json() as { error?: string; deleted?: number }
      if (!res.ok) throw new Error(data.error || "清理失败")
      toast({ title: "清理完成", description: `已删除 ${data.deleted || 0} 个邮箱` })
      setCleanupPreview(null)
      setSelected([])
      await Promise.all([fetchEmails(), fetchBatches(), fetchHealth()])
    } catch (error) {
      toast({ title: "清理失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    } finally {
      setCleaning(false)
    }
  }

  const toggleSelected = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const togglePageSelected = () => {
    const pageIds = pagedEmails.map(item => item.id)
    const allChecked = pageIds.every(id => selectedSet.has(id))
    setSelected(prev => allChecked ? prev.filter(id => !pageIds.includes(id)) : Array.from(new Set([...prev, ...pageIds])))
  }

  const copyCode = (code?: string | null) => {
    if (!code) return
    copyToClipboard(code)
  }

  const copyEmail = (email: string) => copyToClipboard(email)

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-slate-900 dark:from-[#090d18] dark:to-[#070b14] dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0 hidden bg-[linear-gradient(180deg,#090d18_0%,#070b14_100%)] dark:block" />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-[200px] shrink-0 border-r border-primary/20 bg-background/95 shadow-sm dark:!border-white/10 dark:!bg-slate-950 lg:flex lg:flex-col 2xl:w-[232px]">
          <div className="flex h-16 items-center gap-3 border-b border-primary/20 dark:border-white/10 px-4 2xl:px-5">
            <Menu className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15 text-violet-600 dark:text-violet-200">
                <Mail className="h-5 w-5" />
              </div>
              <span className="text-lg font-black tracking-tight">MoeMail</span>
            </div>
          </div>

          <div className="mt-4 space-y-3 px-2.5 2xl:px-3">
            <Panel className="p-3">
              <div className="mb-3 text-sm font-bold">创建邮箱</div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-600 dark:text-slate-400">生成新邮箱地址</Label>
                <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 2xl:grid-cols-[76px_minmax(0,1fr)]">
                  <Input type="number" min={1} max={50} className="h-9 border-primary/20 bg-white text-sm text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100" value={createCount} onChange={e => setCreateCount(Number(e.target.value || 1))} />
                  <Select value={createMode} onValueChange={(v) => setCreateMode(v as CreateMode)}>
                    <SelectTrigger className="h-9 border-primary/20 bg-white text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="human">真实姓名风格</SelectItem>
                      <SelectItem value="numeric">前缀 + 数字</SelectItem>
                      <SelectItem value="prefix">指定前缀</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input className="h-9 border-primary/20 bg-white text-sm text-slate-900 placeholder:text-slate-500 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="自定义前缀（可选）" />
                <Select value={createDomain} onValueChange={setCreateDomain}>
                  <SelectTrigger className="h-9 border-primary/20 bg-white text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100">
                    <SelectValue placeholder="选择域名" />
                  </SelectTrigger>
                  <SelectContent>{domains.map(d => <SelectItem key={d} value={d}>@{d}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="h-9 border-primary/20 bg-white text-sm text-slate-900 placeholder:text-slate-500 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100" value={createTags} onChange={e => setCreateTags(e.target.value)} placeholder="标签，例如 OpenAI" />
                <Button className="h-9 w-full gap-2 bg-violet-600 hover:bg-violet-500" onClick={createEmails} disabled={creating || !createDomain}>
                  <Sparkles className="h-4 w-4" />{creating ? "生成中..." : "生成邮箱"}
                </Button>
              </div>
            </Panel>

            <Panel className="p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Filter className="h-4 w-4 text-violet-600 dark:text-violet-300" />筛选</div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input className="h-9 border-primary/20 bg-white pl-9 text-sm text-slate-900 placeholder:text-slate-500 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && refreshNow()} placeholder="搜索邮箱地址" />
              </div>
              <div className="space-y-1">
                {statusFilterItems.map(item => {
                  const Icon = item.icon
                  const active = statusFilter === item.key
                  return (
                    <button
                      key={item.key}
                      onClick={() => setStatusFilter(item.key)}
                      className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors duration-100", active ? "bg-violet-100 text-violet-700 dark:!bg-violet-950/70 dark:text-violet-100" : "text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:!bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100")}
                    >
                      <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{item.label}</span>
                      <span>{statusCounts[item.key]}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-primary/20 bg-white px-2.5 py-2 dark:!border-white/10 dark:!bg-slate-950/60">
                <div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">只看最近 24 小时</div>
                  <div className="text-[11px] text-slate-500">适合盯最新验证码</div>
                </div>
                <Switch checked={recentOnly} onCheckedChange={setRecentOnly} />
              </div>
              {!!knownTags.length && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {knownTags.slice(0, 8).map(tag => (
                    <button key={tag} onClick={() => setTagFilter(tag)} className="rounded-md border border-primary/20 bg-white px-2 py-1 text-[11px] text-slate-600 hover:text-violet-600 dark:!border-white/10 dark:!bg-slate-950/60 dark:text-slate-400 dark:hover:text-violet-200">#{tag}</button>
                  ))}
                </div>
              )}
              <div className="mt-4 border-t border-primary/20 dark:border-white/10 pt-4">
                <div className="mb-2 text-xs text-slate-500">邮箱域名</div>
                <div className="space-y-2 text-xs">
                  {domainStats.slice(0, 4).map(item => (
                    <button key={item.domain} onClick={() => setDomainFilter(item.domain)} className="flex w-full items-center justify-between text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                      <span className="truncate">{item.domain}</span>
                      <span>{item.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
          <div className="mt-auto" />
        </aside>

        <main className="min-w-0 flex-1 border-r border-primary/20 dark:border-white/10">
          <header className="flex h-16 items-center justify-between border-b border-primary/20 bg-background/90 px-4 backdrop-blur dark:!border-white/10 dark:!bg-slate-950/90 md:px-6">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="grid h-9 w-9 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15">
                <Mail className="h-5 w-5 text-violet-600 dark:text-violet-200" />
              </div>
              <div className="font-black">MoeMail</div>
            </div>
            <div className="hidden items-center gap-2 text-xs text-slate-600 dark:text-slate-400 lg:flex">
              <Activity className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              临时邮箱服务运行中
            </div>
            <div data-otp-topbar className="flex items-center gap-2 rounded-xl bg-transparent dark:bg-transparent">
              <TopModeSwitcher
                isLoggedIn
                itemClassName="text-slate-600 hover:bg-gray-100 hover:text-slate-900 dark:!text-slate-400 dark:hover:!bg-slate-800 dark:hover:!text-slate-100 dark:data-[active=true]:!bg-violet-950/70 dark:data-[active=true]:!text-violet-100"
              />
              <LanguageSwitcher className="text-slate-600 hover:bg-gray-100 hover:text-slate-900 data-[state=open]:bg-gray-100 dark:!text-slate-400 dark:hover:!bg-slate-800 dark:hover:!text-slate-100 dark:data-[state=open]:!bg-slate-800" />
              <ThemeToggle className="text-slate-600 hover:bg-gray-100 hover:text-slate-900 dark:!text-slate-400 dark:hover:!bg-slate-800 dark:hover:!text-slate-100" />
              <Link href={`/${locale}/profile`} prefetch className="ml-1 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-100 hover:bg-gray-100 dark:hover:!bg-slate-800">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-violet-600 text-sm font-bold text-white">{(user?.name || user?.email || "L").slice(0, 1).toUpperCase()}</div>
                <div className="hidden text-left sm:block">
                  <div className="text-xs font-bold leading-4">{user?.name || "loucer"} <span className="ml-1 rounded bg-violet-500/25 px-1.5 py-0.5 text-[10px] text-violet-600 dark:text-violet-200">Pro</span></div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />在线</div>
                </div>
              </Link>
              <MoreHorizontal className="h-4 w-4 text-slate-500" />
            </div>
          </header>

          <div className="px-4 py-6 md:px-5 2xl:px-6">
            <section className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white md:text-3xl">欢迎回来，{user?.name || "loucer"} 👋</h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">高效、稳定、私密的临时邮箱接码服务</p>
              </div>
              {latestCode && (
                <button onClick={() => copyCode(latestCode)} className="w-fit rounded-lg border border-violet-400/25 bg-violet-500/12 px-3 py-2 text-left text-xs text-violet-700 dark:text-violet-100 transition hover:bg-violet-500/18">
                  <span className="block text-slate-600 dark:text-slate-400">最新验证码</span>
                  <span className="mt-1 block text-lg font-black tracking-[0.18em]">{latestCode}</span>
                </button>
              )}
              <Button asChild variant="outline" className="w-fit gap-2 border-primary/20 bg-white text-slate-800 hover:bg-primary/10 hover:text-slate-950 dark:!border-white/10 dark:!bg-slate-900 dark:!text-slate-200 dark:hover:!bg-slate-800 dark:hover:!text-white">
                <Link href="/api/v1/openapi.json" target="_blank">
                  <FileCode2 className="h-4 w-4 text-violet-600 dark:text-violet-300" />API 接口文档
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </section>

            <section className="mb-5 grid gap-3 sm:grid-cols-2 min-[1180px]:grid-cols-4 2xl:gap-4">
              <MetricCard icon={Inbox} label="当前邮箱" value={compactNumber(totalEmailCount)} detail="个活跃邮箱" tone="violet" />
              <MetricCard icon={Archive} label="入库邮件" value={compactNumber(mailCount)} detail="封" tone="blue" />
              <MetricCard icon={ShieldCheck} label="提取验证码" value={compactNumber(codeCount)} detail="个" tone="violet" />
              <MetricCard icon={Gauge} label="服务状态" value={healthLabel} detail={healthStatus === "ok" ? "服务运行良好" : "请检查健康项"} tone="emerald" />
            </section>

            <Panel className="overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-primary/20 dark:!border-slate-800 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-950 dark:text-white">收件箱列表</h2>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    当前页 {pagedEmails.length} 个 · 共 {totalEmailCount} 个邮箱 · {mailCount} 封邮件 · {selected.length} 个已选择 · {autoRefresh ? "SSE 实时监听中" : "自动刷新已暂停"}
                    {lastSyncAt ? ` · 同步于 ${formatClock(lastSyncAt)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={domainFilter} onValueChange={setDomainFilter}>
                    <SelectTrigger className="h-9 w-[138px] border-primary/20 bg-white text-xs text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100">
                      <SelectValue placeholder="域名" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部域名</SelectItem>
                      {domains.map(d => <SelectItem key={d} value={d}>@{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={usedFilter} onValueChange={(v) => setUsedFilter(v as UsedFilter)}>
                    <SelectTrigger className="h-9 w-[118px] border-primary/20 bg-white text-xs text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100">
                      <SelectValue placeholder="使用状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="unused">未用</SelectItem>
                      <SelectItem value="used">已用</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                    <SelectTrigger className="h-9 w-[124px] border-primary/20 bg-white text-xs text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100">
                      <SelectValue placeholder="排序" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(sortLabels) as SortOption[]).map(key => (
                        <SelectItem key={key} value={key}>{sortLabels[key]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={refreshNow} disabled={loading} className="h-9 gap-2 border-primary/20 bg-white text-xs text-slate-800 hover:bg-primary/10 hover:text-slate-950 dark:!border-white/10 dark:!bg-slate-900 dark:!text-slate-200 dark:hover:!bg-slate-800 dark:hover:!text-white">
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />刷新
                  </Button>
                </div>
              </div>

              <div className="hidden grid-cols-[34px_minmax(210px,1.2fr)_minmax(180px,1fr)_120px_88px_96px] gap-3 border-b border-primary/20 bg-gray-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:!border-slate-800 dark:!bg-slate-950/50 min-[1180px]:grid">
                <Checkbox checked={pagedEmails.length > 0 && pagedEmails.every(item => selectedSet.has(item.id))} onChange={togglePageSelected} />
                <div>邮箱地址</div>
                <div>最新邮件</div>
                <div>验证码</div>
                <div>状态</div>
                <div>更新时间</div>
              </div>

              <div>
                {!!pagedEmails.length && (
                  <VirtualMailboxList
                    items={pagedEmails}
                    selectedSet={selectedSet}
                    onToggle={toggleSelected}
                    onCopyEmail={copyEmail}
                    onCopyCode={copyCode}
                    onTagClick={setTagFilter}
                  />
                )}
                {!pagedEmails.length && (
                  <div className="grid min-h-[360px] place-items-center px-4 py-12 text-center">
                    <div>
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-dashed border-gray-300 dark:border-white/20 text-slate-500">
                        <Inbox className="h-5 w-5" />
                      </div>
                      <div className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">{loading ? "正在加载接码数据..." : "没有匹配的邮箱"}</div>
                      <div className="mt-1 text-xs text-slate-500">调整筛选条件，或先创建一批新邮箱。</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-primary/20 dark:!border-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400 md:flex-row md:items-center md:justify-between">
                <div>共 {totalEmailCount} 条 · 第 {currentPage}/{totalPages} 页</div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:bg-primary/5 dark:hover:!bg-slate-800 hover:text-slate-950 dark:hover:text-white" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {pageNumbers.map(pageNumber => (
                    <button key={pageNumber} onClick={() => setPage(pageNumber)} className={cn("h-8 w-8 rounded-md transition-colors duration-100", currentPage === pageNumber ? "bg-violet-600 text-white" : "hover:bg-primary/5 dark:hover:!bg-slate-800")}>{pageNumber}</button>
                  ))}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:bg-primary/5 dark:hover:!bg-slate-800 hover:text-slate-950 dark:hover:text-white" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(1) }}>
                    <SelectTrigger className="h-8 w-[92px] border-primary/20 bg-white text-xs text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50 条/页</SelectItem>
                      <SelectItem value="100">100 条/页</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Panel>
          </div>
        </main>

        <aside className="hidden w-[260px] shrink-0 bg-background/95 px-3 py-6 shadow-sm dark:!bg-slate-950 min-[1180px]:block 2xl:w-[306px]">
          <div className="space-y-3">
            <Panel className="p-4">
              <h3 className="text-sm font-black text-slate-950 dark:text-white">批量管理</h3>
              <div className="mt-4 space-y-2">
                <ActionButton icon={RefreshCw} title="批量刷新" desc="刷新选中邮箱的收件箱" onClick={refreshNow} />
                <ActionButton icon={Download} title="导出邮箱" desc="导出选中邮箱列表" onClick={() => downloadMainTxt()} disabled={!selected.length || exporting} />
                <ActionButton icon={Archive} title="导出当前" desc="导出当前筛选结果" onClick={exportCurrentList} disabled={!totalEmailCount || exporting} />
                <ActionButton icon={Trash2} title="删除选中" desc="删除邮箱和关联邮件" danger onClick={deleteSelected} disabled={!selected.length} />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-primary/20 dark:border-white/10 pt-4 text-xs text-slate-600 dark:text-slate-400">
                <span>已选择 {selected.length} 个邮箱</span>
                <Button size="sm" disabled={!selected.length} onClick={() => updateSelected({ used: true })} className="h-8 bg-slate-700 text-xs text-white hover:bg-slate-600">执行操作</Button>
              </div>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-950 dark:text-white">批次管理</h3>
                <span className="text-xs text-slate-500">{batches.length} 批</span>
              </div>
              <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                {batches.slice(0, 6).map(batch => (
                  <div key={batch.id} className="rounded-lg border border-primary/20 bg-white p-3 dark:!border-white/10 dark:!bg-slate-950/60">
                    <button onClick={() => setBatchFilter(batch.id)} className="line-clamp-1 text-left text-sm font-bold text-slate-800 dark:text-slate-200 hover:text-violet-600 dark:hover:text-violet-200">{batch.name}</button>
                    <div className="mt-1 text-xs text-slate-500">{batch.usedCount}/{batch.emailCount} 已用 · {batch.messageCount} 封邮件</div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 border-primary/20 bg-white px-2 text-[11px] text-slate-700 hover:bg-primary/10 hover:text-slate-950 dark:!border-white/10 dark:!bg-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white" onClick={() => setBatchUsed(batch, true)}>已用</Button>
                      <Button variant="outline" size="sm" className="h-7 border-primary/20 bg-white px-2 text-[11px] text-slate-700 hover:bg-primary/10 hover:text-slate-950 dark:!border-white/10 dark:!bg-slate-900 dark:!text-slate-300 dark:hover:!bg-slate-800 dark:hover:!text-white" onClick={() => setBatchUsed(batch, false)}>未用</Button>
                      <Button variant="outline" size="sm" className="h-7 border-red-400/20 bg-red-500/10 px-2 text-[11px] text-red-700 dark:text-red-200 hover:bg-red-500/15" onClick={() => deleteBatch(batch)}>删除</Button>
                    </div>
                  </div>
                ))}
                {!batches.length && <div className="rounded-lg border border-dashed border-gray-300 dark:border-white/15 px-3 py-6 text-center text-xs text-slate-500">创建多个邮箱后会自动形成批次。</div>}
              </div>
            </Panel>

            <Panel className="p-4">
              <h3 className="text-sm font-black text-slate-950 dark:text-white">清理工具</h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">实时探测</div>
                    <div className="text-xs text-slate-500">8 秒轻量探测，后台自动降频</div>
                  </div>
                  <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                </div>
                <Select value={cleanupMode} onValueChange={(v) => { setCleanupMode(v as CleanupMode); setCleanupPreview(null) }}>
                  <SelectTrigger className="border-primary/20 bg-white text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">清理测试邮箱</SelectItem>
                    <SelectItem value="empty">清理空邮箱</SelectItem>
                    <SelectItem value="olderThan">清理超过 N 天无新邮件</SelectItem>
                  </SelectContent>
                </Select>
                {cleanupMode === "olderThan" && (
                  <Input type="number" min={1} max={365} value={cleanupDays} onChange={e => setCleanupDays(Number(e.target.value || 7))} className="border-primary/20 bg-white text-slate-900 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-slate-100" />
                )}
                <Button variant="outline" className="w-full gap-2 border-primary/20 bg-white text-slate-800 hover:bg-primary/10 hover:text-slate-950 dark:!border-white/10 dark:!bg-slate-900 dark:!text-slate-200 dark:hover:!bg-slate-800 dark:hover:!text-white" onClick={previewCleanup} disabled={cleaning}>
                  <Search className="h-4 w-4" />立即扫描
                </Button>
                <Button className="w-full gap-2 bg-violet-600 hover:bg-violet-500" onClick={confirmCleanup} disabled={cleaning || !cleanupPreview?.count}>
                  <ShieldCheck className="h-4 w-4" />立即清理
                </Button>
                <div className={cn("rounded-lg border px-3 py-2 text-xs", cleanupPreview?.count ? "border-red-400/25 bg-red-500/10 text-red-700 dark:text-red-200" : "border-primary/20 bg-white text-slate-600 dark:!border-white/10 dark:!bg-slate-950/60 dark:text-slate-400")}>
                  可清理邮箱 <span className="float-right font-bold text-red-700 dark:text-red-300">{cleanupPreview?.count || 0} 个</span>
                </div>
              </div>
            </Panel>

            <Panel className="p-4">
              <h3 className="text-sm font-black text-slate-950 dark:text-white">域名状态</h3>
              <div className="mt-4 space-y-3">
                {domainStats.slice(0, 5).map(item => (
                  <div key={item.domain} className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-600 dark:text-slate-400">{item.domain}</span>
                    <span className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />正常 <span className="text-slate-500">{item.count}</span></span>
                  </div>
                ))}
                <div className="mt-2 rounded-lg border border-primary/20 bg-white px-3 py-2 text-xs text-slate-500 dark:!border-white/10 dark:!bg-slate-950/60">域名列表低频缓存，创建邮箱时自动使用可用域名。</div>
              </div>
            </Panel>

            <Panel className="p-4">
              <h3 className="text-sm font-black text-slate-950 dark:text-white">快捷操作</h3>
              <div className="mt-4 space-y-2">
                <QuickLink href={`/${locale}/moe`} icon={Mail} label="进入邮箱页" />
              </div>
            </Panel>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-primary/20 bg-white shadow-[0_18px_48px_rgba(15,23,42,.08)] dark:!border-white/10 dark:!bg-slate-900 dark:!shadow-[0_18px_48px_rgba(0,0,0,.18)]", className)}>
      {children}
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Inbox; label: string; value: string; detail: string; tone: "violet" | "blue" | "emerald" }) {
  const toneClass = {
    violet: "border-violet-400/20 bg-violet-500/12 text-violet-600 dark:text-violet-200",
    blue: "border-sky-400/20 bg-sky-500/12 text-sky-700 dark:text-sky-200",
    emerald: "border-emerald-400/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200",
  }[tone]

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-4">
        <div className={cn("grid h-10 w-10 place-items-center rounded-lg border", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</div>
          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{detail}</div>
        </div>
      </div>
    </Panel>
  )
}

function VirtualMailboxList({
  items,
  selectedSet,
  onToggle,
  onCopyEmail,
  onCopyCode,
  onTagClick,
}: {
  items: OtpEmail[]
  selectedSet: Set<string>
  onToggle: (id: string) => void
  onCopyEmail: (email: string) => void
  onCopyCode: (code?: string | null) => void
  onTagClick: (tag: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 1180)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const rowHeight = isNarrow ? 190 : 118
  const viewportHeight = Math.min(620, Math.max(rowHeight * Math.min(items.length, 5), 360))
  const overscan = 5
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const endIndex = Math.min(items.length, startIndex + visibleCount)
  const visibleItems = items.slice(startIndex, endIndex)

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
    setScrollTop(0)
  }, [items])

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto"
      style={{ height: viewportHeight }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: items.length * rowHeight }}>
        <div
          className="absolute left-0 right-0 top-0 divide-y divide-gray-200 dark:!divide-slate-800"
          style={{ transform: `translateY(${startIndex * rowHeight}px)` }}
        >
          {visibleItems.map(item => (
            <div key={item.id} style={{ height: rowHeight }}>
              <MailboxRow
                item={item}
                checked={selectedSet.has(item.id)}
                onCheck={() => onToggle(item.id)}
                onCopyEmail={() => onCopyEmail(item.address)}
                onCopyCode={() => onCopyCode(item.latestCode)}
                onTagClick={onTagClick}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MailboxRow({
  item,
  checked,
  onCheck,
  onCopyEmail,
  onCopyCode,
  onTagClick,
}: {
  item: OtpEmail
  checked: boolean
  onCheck: () => void
  onCopyEmail: () => void
  onCopyCode: () => void
  onTagClick: (tag: string) => void
}) {
  const hasMail = Boolean(item.latestReceivedAt)
  const status = item.used ? "已使用" : hasMail ? "有新邮件" : "无新邮件"

  return (
    <div className="grid h-full gap-3 overflow-hidden px-4 py-3 transition hover:bg-primary/5 dark:hover:bg-white/[0.035] min-[1180px]:grid-cols-[34px_minmax(210px,1.2fr)_minmax(180px,1fr)_120px_88px_96px] min-[1180px]:items-center">
      <Checkbox checked={checked} onChange={onCheck} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", item.used ? "bg-slate-500" : hasMail ? "bg-emerald-400" : "bg-slate-600")} />
          <button onClick={onCopyEmail} className="truncate text-sm font-bold text-slate-900 dark:text-slate-100 hover:text-violet-600 dark:hover:text-violet-200">{item.address}</button>
          <button onClick={onCopyEmail} className="shrink-0 text-slate-500 hover:text-violet-600 dark:hover:text-violet-200" title="复制邮箱"><Copy className="h-4 w-4" /></button>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">创建于 {new Date(item.createdAt).toLocaleString("zh-CN")}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.batchName && <span className="rounded border border-primary/20 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 dark:!border-white/10 dark:!bg-slate-950/60 dark:text-slate-400">{item.batchName}</span>}
          {(item.tags || []).slice(0, 3).map(tag => <button key={tag} onClick={() => onTagClick(tag)} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-slate-600 hover:text-violet-600 dark:!bg-slate-800 dark:text-slate-400 dark:hover:text-violet-200">#{tag}</button>)}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ProviderBadge provider={item.provider} />
          <span className="truncate text-sm text-slate-700 dark:text-slate-300">{item.latestFrom || item.provider || "暂无邮件"}</span>
        </div>
        <div className="mt-1 truncate text-xs text-slate-500">{item.latestSubject || "等待新邮件进入收件箱"}</div>
        {hasMail && !item.latestCode && item.latestPreview && (
          <div className="mt-1 line-clamp-1 text-[11px] text-amber-700 dark:text-amber-300">未识别验证码：{item.latestPreview}</div>
        )}
      </div>

      <button onClick={onCopyCode} disabled={!item.latestCode} className={cn("flex h-10 items-center justify-between rounded-lg border px-3 text-left transition", item.latestCode ? "border-violet-400/25 bg-violet-500/14 text-violet-700 dark:text-violet-100 hover:border-violet-300/40" : "border-primary/20 bg-white text-slate-500 dark:!border-white/10 dark:!bg-slate-950/60")}>
        <span className="font-black tracking-[0.18em]">{item.latestCode || "------"}</span>
        <Copy className="h-4 w-4 opacity-70" />
      </button>

      <span className={cn("w-fit rounded-full px-2.5 py-1 text-xs font-bold", item.used ? "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300" : hasMail ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>{status}</span>

      <div className="text-xs">
        <div className="font-bold text-slate-800 dark:text-slate-200">{formatClock(item.latestReceivedAt || item.createdAt)}</div>
        <div className="mt-1 text-slate-500">{formatRelativeTime(item.latestReceivedAt || item.createdAt)}</div>
      </div>
    </div>
  )
}

function ProviderBadge({ provider }: { provider?: string | null }) {
  const label = provider === "openai" ? "OpenAI" : provider === "microsoft" ? "Microsoft" : provider === "generic" ? "OTP" : "Mail"
  const color = provider === "openai" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : provider === "microsoft" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-primary/5 text-slate-700 dark:!bg-slate-800 dark:text-slate-300"
  return <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold", color)}>{label}</span>
}

function ActionButton({ icon: Icon, title, desc, danger, disabled, onClick }: { icon: typeof RefreshCw; title: string; desc: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-lg border border-primary/20 bg-white p-3 text-left transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 dark:!border-white/10 dark:!bg-slate-950/60 dark:hover:!bg-slate-800", danger && "border-red-400/20 bg-red-500/8")}>
      <div className={cn("grid h-9 w-9 place-items-center rounded-lg bg-gray-100 dark:!bg-slate-800", danger ? "text-red-700 dark:text-red-300" : "text-violet-600 dark:text-violet-200")}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
    </button>
  )
}

function QuickLink({ href, icon: Icon, label, external }: { href: string; icon: LucideIcon; label: string; external?: boolean }) {
  return (
    <Link href={href} target={external ? "_blank" : undefined} className="flex h-10 items-center justify-between rounded-lg border border-primary/20 bg-white px-3 text-sm text-slate-700 transition hover:bg-primary/5 hover:text-slate-950 dark:!border-white/10 dark:!bg-slate-950/60 dark:text-slate-300 dark:hover:!bg-slate-800 dark:hover:text-white">
      <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-slate-500" />{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-500" />
    </Link>
  )
}
