"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { LanguageSwitcher } from "@/components/layout/language-switcher"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { TopModeSwitcher } from "@/components/layout/top-mode-switcher"
import { cn } from "@/lib/utils"
import {
	  Home,
	  Inbox,
	  Mail,
	  MoreHorizontal,
	} from "lucide-react"

export const otpNavItems = [
	  { key: "dashboard", label: "工作台", icon: Home, href: "otp" },
	  { key: "mailbox", label: "收件箱", icon: Inbox, href: "moe" },
	]

interface OtpControlShellProps {
  active: string
  locale: string
  user?: {
    name?: string | null
    email?: string | null
  }
  children: ReactNode
}

export function OtpControlShell({ active, locale, user, children }: OtpControlShellProps) {
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,#090d18_0%,#070b14_100%)]" />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-[200px] shrink-0 border-r border-white/10 bg-[#080d18]/92 lg:flex lg:flex-col 2xl:w-[232px]">
          <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4 2xl:px-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15 text-violet-200">
              <Mail className="h-5 w-5" />
            </div>
            <span className="text-lg font-black tracking-tight">MoeMail</span>
          </div>
          <nav className="space-y-1 px-3 py-4">
            {otpNavItems.map(item => {
              const Icon = item.icon
              const isActive = active === item.key
              return (
                <Link
                  key={item.key}
                  href={`/${locale}/${item.href}`}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-100",
                    isActive ? "bg-violet-950/70 text-violet-100 shadow-[inset_0_0_0_1px_rgba(139,92,246,.22)]" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-16 items-center justify-between border-b border-white/10 bg-[#080d18]/80 px-4 backdrop-blur md:px-6">
            <Link href={`/${locale}/otp`} className="flex items-center gap-3 lg:hidden">
              <div className="grid h-9 w-9 place-items-center rounded-lg border border-violet-400/40 bg-violet-500/15">
                <Mail className="h-5 w-5 text-violet-200" />
              </div>
              <div className="font-black">MoeMail</div>
            </Link>
            <div className="hidden text-xs text-slate-400 lg:block">MoeMail 接码控制台</div>
	            <div className="flex items-center gap-2">
		              <TopModeSwitcher
		                isLoggedIn
		                itemClassName="text-slate-400 hover:bg-slate-800 hover:text-slate-100 data-[active=true]:bg-violet-950/70"
		              />
	              <LanguageSwitcher />
              <ThemeToggle />
              <Link href={`/${locale}/profile`} prefetch className="ml-1 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-100 hover:bg-slate-800">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-violet-600 text-sm font-bold">{(user?.name || user?.email || "L").slice(0, 1).toUpperCase()}</div>
                <div className="hidden text-left sm:block">
                  <div className="text-xs font-bold leading-4">{user?.name || "loucer"} <span className="ml-1 rounded bg-violet-500/25 px-1.5 py-0.5 text-[10px] text-violet-200">Pro</span></div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />在线</div>
                </div>
              </Link>
              <MoreHorizontal className="h-4 w-4 text-slate-500" />
            </div>
          </header>
          <div className="px-4 py-6 md:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
