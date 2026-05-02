"use client"

import { useCallback } from "react"
import { useToast } from "@/components/ui/use-toast"

interface UseCopyOptions {
  successMessage?: string
  errorMessage?: string
}

export function useCopy(options: UseCopyOptions = {}) {
  const { toast } = useToast()
  const {
    successMessage = "已复制到剪贴板",
    errorMessage = "复制失败"
  } = options

  const copyToClipboard = useCallback(async (text: string) => {
    const value = String(text || "")
    if (!value) return false

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(value)
        } catch {
          copyWithFallbacks(value)
        }
      } else {
        copyWithFallbacks(value)
      }

      toast({
        title: "成功",
        description: successMessage
      })
      return true
    } catch {
      const prompted = showManualCopyPrompt(value)
      toast(prompted
        ? {
            title: "复制受限",
            description: "浏览器拦截自动复制，已打开手动复制框"
          }
        : {
            title: "错误",
            description: errorMessage,
            variant: "destructive"
          })
      return false
    }
  }, [successMessage, errorMessage, toast])

  return {
    copyToClipboard
  }
}

function copyWithFallbacks(text: string) {
  try {
    copyWithCopyEvent(text)
    return
  } catch {
    copyWithTextareaFallback(text)
  }
}

function copyWithCopyEvent(text: string) {
  let handled = false
  const onCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData("text/plain", text)
    event.preventDefault()
    handled = true
  }

  document.addEventListener("copy", onCopy)
  const copied = document.execCommand("copy")
  document.removeEventListener("copy", onCopy)

  if (!copied || !handled) {
    throw new Error("copy event fallback failed")
  }
}

function copyWithTextareaFallback(text: string) {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const selection = document.getSelection()
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.setAttribute("aria-hidden", "true")
  textarea.style.position = "fixed"
  textarea.style.top = "-9999px"
  textarea.style.left = "-9999px"
  textarea.style.width = "1px"
  textarea.style.height = "1px"
  textarea.style.opacity = "0"
  textarea.style.pointerEvents = "none"
  document.body.appendChild(textarea)

  selection?.removeAllRanges()
  textarea.focus({ preventScroll: true })
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  const copied = document.execCommand("copy") || document.execCommand("copy", true, text)
  document.body.removeChild(textarea)
  activeElement?.focus({ preventScroll: true })

  if (!copied) {
    throw new Error("fallback copy failed")
  }
}

function showManualCopyPrompt(text: string) {
  if (typeof window === "undefined" || typeof window.prompt !== "function") return false
  window.prompt("浏览器禁止自动复制，请手动复制：", text)
  return true
}
