"use client"

import { useMemo } from "react"
import { CheckCircle2, Clipboard, Code2, FileJson, KeyRound, Server } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useCopy } from "@/hooks/use-copy"
import { cn } from "@/lib/utils"

type ConfigLineProps = {
  label: string
  value: string
  onCopy: (value: string) => void
}

function ConfigLine({ label, value, onCopy }: ConfigLineProps) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/70 bg-background/70 p-3 sm:grid-cols-[128px_1fr_auto] sm:items-center">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <code className="min-w-0 overflow-x-auto whitespace-nowrap rounded-md bg-muted px-2 py-1.5 text-xs text-foreground">
        {value}
      </code>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onCopy(value)}>
        <Clipboard className="h-3.5 w-3.5" />
        复制
      </Button>
    </div>
  )
}

function Snippet({ title, value, onCopy }: { title: string; value: string; onCopy: (value: string) => void }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Code2 className="h-4 w-4 text-primary" />
          {title}
        </div>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => onCopy(value)}>
          <Clipboard className="h-3.5 w-3.5" />
          复制
        </Button>
      </div>
      <pre className="max-h-56 overflow-auto p-3 text-xs leading-relaxed text-muted-foreground">
        <code>{value}</code>
      </pre>
    </div>
  )
}

interface ApiConfigDialogProps {
  triggerClassName?: string
}

export function ApiConfigDialog({ triggerClassName }: ApiConfigDialogProps) {
  const { copyToClipboard } = useCopy()
  const baseUrl = typeof window === "undefined" ? "https://mail.loucer.cn" : window.location.origin

  const snippets = useMemo(() => {
    const legacyWait = `${baseUrl}/api/otp/wait?email={{邮箱地址}}&timeout=60&interval=3`
    const v1Wait = `${baseUrl}/api/v1/otp/wait?email={{邮箱地址}}&timeout=60&interval=3`
    const curl = `curl "${v1Wait}" \\
  -H "X-API-Key: mk_xxx"`
    const create = `curl -X POST "${baseUrl}/api/v1/otp/create" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: mk_xxx" \\
  -d '{
    "count": 1,
    "domain": "intereloucer.com",
    "prefix": "openai",
    "mode": "human",
    "batch_name": "openai-run"
  }'`
    const parser = `旧接口验证码字段：code
v1 接口验证码字段：data.code
认证 Header：X-API-Key: mk_xxx
超时建议：timeout=60&interval=3`

    return { legacyWait, v1Wait, curl, create, parser }
  }, [baseUrl])

  const copy = (value: string) => {
    void copyToClipboard(value)
  }

  return (
    <Dialog>
	      <DialogTrigger asChild>
	        <Button variant="ghost" size="sm" className={cn("hidden h-9 gap-1.5 px-2.5 sm:inline-flex", triggerClassName)}>
          <FileJson className="h-4 w-4" />
          <span>接口配置</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-3xl overflow-y-auto border-primary/20 p-0">
        <DialogHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <Server className="h-4 w-4" />
            MoeMail API Console
          </div>
          <DialogTitle className="text-xl">接口配置</DialogTitle>
          <DialogDescription>
            旧接口继续兼容现有第三方软件；新接入建议使用 v1，响应格式更稳定。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 py-4">
          <div className="grid gap-3">
            <ConfigLine label="服务地址" value={baseUrl} onCopy={copy} />
            <ConfigLine label="OpenAPI" value={`${baseUrl}/api/v1/openapi.json`} onCopy={copy} />
            <ConfigLine label="认证 Header" value="X-API-Key: mk_xxx" onCopy={copy} />
            <ConfigLine label="旧版拉码 URL" value={snippets.legacyWait} onCopy={copy} />
            <ConfigLine label="v1 拉码 URL" value={snippets.v1Wait} onCopy={copy} />
          </div>

          <div className="grid gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-950 dark:text-emerald-50">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <div className="font-semibold">现有下游不用立刻改</div>
                <div className="mt-1 text-xs leading-5 text-emerald-900/80 dark:text-emerald-100/80">
                  如果第三方软件已经解析旧接口的 <code>code</code> 字段，继续使用 <code>/api/otp/wait</code> 或 <code>/api/otp/latest</code>。新 v1 接口的验证码在 <code>data.code</code>。
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Snippet title="第三方软件字段" value={snippets.parser} onCopy={copy} />
            <Snippet title="curl 拉取验证码" value={snippets.curl} onCopy={copy} />
          </div>

          <Snippet title="创建邮箱示例" value={snippets.create} onCopy={copy} />

          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              返回格式
            </div>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="rounded-md bg-muted p-2">
                <div className="mb-1 font-semibold text-foreground">旧接口</div>
                <code>{'{ "email": "...", "code": "123456" }'}</code>
              </div>
              <div className="rounded-md bg-muted p-2">
                <div className="mb-1 font-semibold text-foreground">v1 接口</div>
                <code>{'{ "success": true, "data": { "code": "123456" } }'}</code>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
