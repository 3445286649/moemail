"use client"

import Link from "next/link"
import { ApiKeyPanel } from "@/components/profile/api-key-panel"
import { Button } from "@/components/ui/button"
import { useCopy } from "@/hooks/use-copy"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileCode2,
  KeyRound,
  PlugZap,
  ShieldCheck,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react"

const endpoints = [
  { method: "POST", path: "/api/v1/otp/create", desc: "创建一个或一批永久接码邮箱" },
  { method: "GET", path: "/api/v1/otp/emails", desc: "读取邮箱列表和最新验证码缓存" },
  { method: "GET", path: "/api/v1/otp/latest", desc: "读取指定邮箱最新验证码" },
  { method: "GET", path: "/api/v1/otp/wait", desc: "等待验证码到达，适合自动化脚本" },
  { method: "POST", path: "/api/v1/otp/export", desc: "导出 mail.txt 兼容内容" },
]

const examples = [
  {
    title: "创建邮箱",
    code: `curl -X POST "$ORIGIN/api/v1/otp/create" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "count": 1,
    "mode": "human",
    "tags": ["openai"],
    "expiry_time_ms": 0
  }'`,
  },
  {
    title: "筛选并排序",
    code: `curl "$ORIGIN/api/v1/otp/emails?status=code&sort=code_first&limit=50" \\
  -H "X-API-Key: YOUR_API_KEY"`,
  },
  {
    title: "等待验证码",
    code: `curl "$ORIGIN/api/v1/otp/wait?email=NAME@DOMAIN&timeout=60&interval=3" \\
  -H "X-API-Key: YOUR_API_KEY"`,
  },
  {
    title: "导出 mail.txt",
    code: `curl -X POST "$ORIGIN/api/v1/otp/export" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"limit": 200, "locale": "zh-CN"}'`,
  },
]

export function OtpApiInterface({ canManageApiKey }: { canManageApiKey: boolean }) {
  const { copyToClipboard } = useCopy()

  const copyExample = (code: string) => {
    const origin = window.location.origin
    void copyToClipboard(code.replaceAll("$ORIGIN", origin))
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-5">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
            <PlugZap className="h-4 w-4" />
            API Interface
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-white md:text-3xl">API 接口</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            使用现有 API Key 能力调用接码 v1 接口，适合后续同步服务器和自动化脚本接入。
          </p>
        </div>
        <Button asChild variant="outline" className="w-fit gap-2 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white">
          <Link href="/api/v1/openapi.json" target="_blank">
            <FileCode2 className="h-4 w-4 text-violet-300" />
            OpenAPI JSON
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
        <Panel className="p-4 md:p-5">
          <div className="mb-4 flex items-center gap-3">
            <IconBox icon={KeyRound} />
            <div>
              <h2 className="text-lg font-black text-white">API Key</h2>
              <p className="text-xs text-slate-500">复用现有密钥接口：创建、启用、停用、删除。</p>
            </div>
          </div>
          <div className="[&_.bg-background]:bg-[#0b1120] [&_.bg-card]:bg-white/5 [&_.bg-muted\\/50]:bg-black/20 [&_.border-2]:border [&_.border]:border-white/10 [&_.text-foreground]:text-slate-100 [&_.text-muted-foreground]:text-slate-500 [&>div]:border-white/10 [&>div]:bg-[#0b1120] [&>div]:text-slate-100">
            <ApiKeyPanel canManageApiKeyOverride={canManageApiKey} />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <IconBox icon={ShieldCheck} />
              <div>
                <h2 className="text-base font-black text-white">调用约定</h2>
                <p className="text-xs text-slate-500">所有 v1 接口统一响应结构。</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-slate-300">
              <Rule label="Header" value="X-API-Key: YOUR_API_KEY" />
              <Rule label="Success" value="{ success: true, data, meta }" />
              <Rule label="Error" value="{ success: false, error, meta }" />
              <Rule label="Codes" value="UNAUTHORIZED / VALIDATION_ERROR / WAIT_TIMEOUT" />
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <IconBox icon={CheckCircle2} />
              <div>
                <h2 className="text-base font-black text-white">性能策略</h2>
                <p className="text-xs text-slate-500">前端常驻缓存，更新探针只查版本。</p>
              </div>
            </div>
            <div className="space-y-3 text-xs leading-5 text-slate-400">
              <p>接码工作台切页返回会先显示本地缓存，不重新拉全量列表。</p>
              <p>验证码到达时由轻量 updates 探针发现版本变化，再刷新邮箱列表。</p>
              <p>页面隐藏时自动降频，减少数据库和前端渲染压力。</p>
            </div>
          </Panel>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel className="overflow-hidden">
          <div className="border-b border-white/10 px-4 py-4">
            <h2 className="text-lg font-black text-white">v1 接码接口</h2>
            <p className="mt-1 text-xs text-slate-500">只展示当前已经接好的接口。</p>
          </div>
          <div className="divide-y divide-white/8">
            {endpoints.map(endpoint => (
              <div key={endpoint.path} className="grid gap-2 px-4 py-3 md:grid-cols-[76px_minmax(0,1fr)] md:items-center">
                <span className={cn(
                  "w-fit rounded-md px-2 py-1 text-xs font-black",
                  endpoint.method === "GET" ? "bg-emerald-500/15 text-emerald-300" : "bg-violet-500/18 text-violet-200",
                )}>
                  {endpoint.method}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm text-slate-100">{endpoint.path}</div>
                  <div className="mt-1 text-xs text-slate-500">{endpoint.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="border-b border-white/10 px-4 py-4">
            <h2 className="text-lg font-black text-white">常用请求</h2>
            <p className="mt-1 text-xs text-slate-500">复制时会自动替换为当前站点地址。</p>
          </div>
          <div className="space-y-3 p-4">
            {examples.map(example => (
              <div key={example.title} className="rounded-lg border border-white/10 bg-black/20">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                    <TerminalSquare className="h-4 w-4 text-violet-300" />
                    {example.title}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => copyExample(example.code)}>
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </div>
                <pre className="overflow-x-auto p-3 text-xs leading-5 text-slate-300"><code>{example.code}</code></pre>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-white/10 bg-[#0d1322]/86 shadow-[0_18px_48px_rgba(0,0,0,.18)]", className)}>
      {children}
    </section>
  )
}

function IconBox({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-violet-400/20 bg-violet-500/12 text-violet-200">
      <Icon className="h-5 w-5" />
    </div>
  )
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="truncate font-mono text-xs text-slate-200">{value}</span>
    </div>
  )
}
