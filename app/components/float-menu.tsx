"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { Github } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function FloatMenu() {
  const t = useTranslations("common")
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])
  
  // 登录页和分享页都不展示源码悬浮按钮，避免和登录入口混淆。
  if (!mounted || pathname.includes("/login") || pathname.includes("/shared/")) {
    return null
  }
  
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="bg-white dark:bg-background rounded-full shadow-lg group relative border-primary/20"
              onClick={() => window.open("https://github.com/beilunyang/moemail", "_blank")}
            >
              <Github 
                className="w-4 h-4 transition-all duration-300 text-primary group-hover:scale-110"
              />
              <span className="sr-only">{t("github")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p>{t("github")}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
} 