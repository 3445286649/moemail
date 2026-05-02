"use client"

import { ThemeToggle } from "@/components/theme/theme-toggle"
import { LanguageSwitcher } from "@/components/layout/language-switcher"
import { Logo } from "@/components/ui/logo"
import { TopModeSwitcher } from "@/components/layout/top-mode-switcher"
import { HeaderAccount } from "@/components/auth/header-account"
import { useSession } from "next-auth/react"

export function Header() {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/80 backdrop-blur-sm border-b">
      <div className="container mx-auto h-full px-4">
        <div className="h-full flex items-center justify-between">
	          <Logo />
	          <div className="flex items-center gap-y-4 gap-x-3 sm:gap-x-4">
	            <TopModeSwitcher isLoggedIn={isLoggedIn} />
	            <LanguageSwitcher />
	            <ThemeToggle />
	            <HeaderAccount user={session?.user} />
	          </div>
        </div>
      </div>
    </header>
  )
}
