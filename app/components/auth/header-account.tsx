"use client"

import Image from "next/image"
import Link from "next/link"
import { signOut } from "next-auth/react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

interface HeaderAccountProps {
  user?: {
    name?: string | null
    email?: string | null
    image?: string | null
  } | null
}

export function HeaderAccount({ user }: HeaderAccountProps) {
  const locale = useLocale()
  const t = useTranslations("auth.signButton")

  if (!user) {
    return (
      <Button asChild>
        <Link href={`/${locale}/login`}>{t("login")}</Link>
      </Button>
    )
  }

  const initial = (user.name || user.email || "L").slice(0, 1).toUpperCase()

  return (
    <div className="flex items-center gap-y-4 gap-x-3 sm:gap-x-4">
      <Link
        href={`/${locale}/profile`}
        prefetch
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-primary/10 hover:text-primary"
      >
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name || t("userAvatar")}
            width={24}
            height={24}
            className="rounded-full"
          />
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {initial}
          </span>
        )}
        <span className="hidden sm:inline-block text-sm">{user.name || user.email}</span>
      </Link>
      <Button onClick={() => signOut({ callbackUrl: `/${locale}` })} variant="outline" className="flex-shrink-0">
        {t("logout")}
      </Button>
    </div>
  )
}
