"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Copy, Download, Plus, RefreshCw } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCopy } from "@/hooks/use-copy"
import { useConfig } from "@/hooks/use-config"

interface CreateDialogProps {
  onEmailCreated: () => void
}

type CreateMode = "human" | "numeric" | "prefix"

export function CreateDialog({ onEmailCreated }: CreateDialogProps) {
  const { config } = useConfig()
  const t = useTranslations("emails.create")
  const tList = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [prefix, setPrefix] = useState("")
  const [count, setCount] = useState(1)
  const [mode, setMode] = useState<CreateMode>("human")
  const [currentDomain, setCurrentDomain] = useState("")
  const [lastCreatedIds, setLastCreatedIds] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()

  const previewName = prefix.trim() || (mode === "human" ? "austinking247" : mode === "numeric" ? "mail123456" : "prefix2048")

  const copyEmailAddress = () => {
    if (!currentDomain) return
    copyToClipboard(`${previewName}@${currentDomain}`)
  }

  const downloadMailTxt = async (ids: string[]) => {
    if (!ids.length) {
      toast({ title: tList("error"), description: "没有可导出的邮箱" })
      return
    }

    setExporting(true)
    try {
      const response = await fetch("/api/otp/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, locale: "zh-CN" }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || "导出失败")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "mail.txt"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: "已下载 mail.txt", description: `共 ${response.headers.get("X-Export-Count") || ids.length} 个邮箱` })
    } catch (error) {
      toast({ title: "导出失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  const createEmail = async () => {
    if (!currentDomain) {
      toast({ title: tList("error"), description: "未读取到可用域名，请刷新页面后重试", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/otp/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix,
          count,
          mode,
          domain: currentDomain,
          expiryTime: 0,
        })
      })

      const data = await response.json() as { error?: string; count?: number; created?: Array<{ id: string; email?: string; address?: string }> }
      if (!response.ok) {
        toast({ title: tList("error"), description: data.error || "创建失败", variant: "destructive" })
        return
      }

      const createdIds = (data.created || []).map(item => item.id).filter(Boolean)
      setLastCreatedIds(createdIds)
      toast({ title: tList("success"), description: `已创建 ${data.count || 1} 个永久邮箱，可下载 mail.txt` })
      onEmailCreated()
      setPrefix("")
      if (createdIds.length && window.confirm("已创建完成，是否立即下载 mail.txt？")) {
        await downloadMailTxt(createdIds)
      }
    } catch {
      toast({ title: tList("error"), description: t("failed"), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const domains = config?.activeEmailDomainsArray?.length ? config.activeEmailDomainsArray : (config?.emailDomainsArray?.map(d => d.trim()).filter(Boolean) ?? [])
    if (domains.length > 0 && (!currentDomain || !domains.includes(currentDomain))) setCurrentDomain(domains[0])
  }, [config, currentDomain])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          {t("title")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>数量</Label>
              <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.min(Math.max(Number(e.target.value || 1), 1), 50))} />
            </div>
            <div className="space-y-1.5">
              <Label>生成规则</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as CreateMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="human">真实姓名风格</SelectItem>
                  <SelectItem value="numeric">前缀 + 数字</SelectItem>
                  <SelectItem value="prefix">指定前缀</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="前缀可留空，默认生成真实邮箱名" className="flex-1" />
            {((config?.activeEmailDomainsArray?.length || config?.emailDomainsArray?.length || 0) > 1) && (
              <Select value={currentDomain} onValueChange={setCurrentDomain}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>{(config?.activeEmailDomainsArray?.length ? config.activeEmailDomainsArray : config?.emailDomainsArray)?.map(d => <SelectItem key={d} value={d}>@{d}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button variant="outline" size="icon" onClick={() => setPrefix("")} type="button"><RefreshCw className="w-4 h-4" /></Button>
          </div>

          <div className="rounded-xl border border-primary/15 bg-muted/40 p-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="shrink-0">预览:</span>
              {currentDomain ? (
                <button className="flex min-w-0 items-center gap-2 hover:text-primary" onClick={copyEmailAddress}>
                  <span className="truncate">{`${previewName}@${currentDomain}`}</span>
                  <Copy className="size-4 shrink-0" />
                </button>
              ) : <span>...</span>}
            </div>
            <div className="mt-1 text-xs">默认永久有效。批量创建最多 50 个。</div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>{tCommon("cancel")}</Button>
          <Button variant="outline" onClick={() => downloadMailTxt(lastCreatedIds)} disabled={!lastCreatedIds.length || exporting} className="gap-2">
            <Download className="h-4 w-4" />下载 mail.txt
          </Button>
          <Button onClick={createEmail} disabled={loading || !currentDomain}>{loading ? t("creating") : `创建 ${count} 个`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
