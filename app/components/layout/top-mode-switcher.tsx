"use client"

import Link from "next/link"
import { useLocale } from "next-intl"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { Inbox, MailCheck } from "lucide-react"
import { ApiConfigDialog } from "@/components/layout/api-config-dialog"
import { cn } from "@/lib/utils"

interface TopModeSwitcherProps {
  isLoggedIn?: boolean
  className?: string
  itemClassName?: string
}

const navItems = [
  { key: "otp", label: "接码", href: "otp", icon: MailCheck },
  { key: "moe", label: "邮箱", href: "moe", icon: Inbox },
]

export function TopModeSwitcher({ isLoggedIn, className, itemClassName }: TopModeSwitcherProps) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    router.prefetch(`/${locale}/otp`)
    router.prefetch(`/${locale}/moe`)
  }, [locale, router])

  return (
    <nav className={cn("hidden items-center gap-1 sm:flex", className)} aria-label="主界面切换">
      {navItems.map((item) => {
        const Icon = item.icon
        const href = `/${locale}/${item.href}`
        const active = pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={item.key}
            href={href}
            prefetch
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : undefined}
            onPointerEnter={() => router.prefetch(href)}
            onFocus={() => router.prefetch(href)}
            className={cn(
              itemClassName,
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors duration-100 ease-out",
              "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              "dark:text-slate-400 dark:hover:!bg-slate-800 dark:hover:!text-slate-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              active && "bg-violet-100 text-violet-700 dark:!bg-violet-950/70 dark:!text-violet-100",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        )
      })}
      {isLoggedIn && <ApiConfigDialog triggerClassName={itemClassName} />}
    </nav>
  )
}
