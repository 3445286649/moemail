"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import {Mail, Calendar, RefreshCw, Trash2, Share2} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useThrottle } from "@/hooks/use-throttle"
import { useToast } from "@/components/ui/use-toast"
import { ShareMessageDialog } from "./share-message-dialog"
import { extractOtp } from "@/lib/otp"
import { messageBucketKey, type MailboxMessage, useMailboxStore } from "@/stores/mailbox-store"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

type Message = MailboxMessage

interface MessageListProps {
  email: {
    id: string
    address: string
  }
  messageType: 'received' | 'sent'
  onMessageSelect: (messageId: string | null, messageType?: 'received' | 'sent') => void
  selectedMessageId?: string | null
  refreshTrigger?: number
}

interface MessageResponse {
  messages: Message[]
  nextCursor: string | null
  total: number
}

export function MessageList({ email, messageType, onMessageSelect, selectedMessageId, refreshTrigger }: MessageListProps) {
  const t = useTranslations("emails.messages")
  const tList = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const bucketKey = useMemo(() => messageBucketKey(email.id, messageType), [email.id, messageType])
  const { emailVersion, messageBuckets, setMessages, removeMessage } = useMailboxStore()
  const bucket = messageBuckets[bucketKey]
  const messages = bucket?.messages || []
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(520)
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null)
  const requestSeqRef = useRef(0)
  const lastRefreshVersionRef = useRef(emailVersion)
  const { toast } = useToast()

  const fetchMessages = useCallback(async (cursor?: string, options?: { silent?: boolean }) => {
    const requestId = requestSeqRef.current + 1
    requestSeqRef.current = requestId
    requestRef.current?.controller.abort()
    const controller = new AbortController()
    requestRef.current = { id: requestId, controller }

    try {
      if (!cursor && !options?.silent) setLoading(true)
      const url = new URL(`/api/emails/${email.id}`, window.location.origin)
      if (messageType === 'sent') {
        url.searchParams.set('type', 'sent')
      }
      if (cursor) {
        url.searchParams.set('cursor', cursor)
      }
      const response = await fetch(url, { signal: controller.signal })
      const data = await response.json() as MessageResponse
      if (requestRef.current?.id !== requestId) return

      setMessages(bucketKey, data.messages || [], data.nextCursor, data.total, Boolean(cursor))
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.error("Failed to fetch messages:", error)
    } finally {
      if (requestRef.current?.id !== requestId) return
      requestRef.current = null
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [bucketKey, email.id, messageType, setMessages])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchMessages()
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    setScrollTop(scrollTop)
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold && bucket?.nextCursor) {
      setLoadingMore(true)
      fetchMessages(bucket.nextCursor, { silent: true })
    }
  }, 200)

  useEffect(() => {
    const node = listRef.current
    if (!node || typeof ResizeObserver === "undefined") return
    setViewportHeight(node.clientHeight || 520)
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(Math.max(240, Math.floor(entry.contentRect.height)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const handleDelete = async (message: Message) => {
    try {
      const response = await fetch(`/api/emails/${email.id}/${message.id}${messageType === 'sent' ? '?type=sent' : ''}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: tList("error"),
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      removeMessage(bucketKey, message.id)

      toast({
        title: tList("success"),
        description: tList("deleteSuccess")
      })

      if (selectedMessageId === message.id) {
        onMessageSelect(null)
      }
    } catch {
      toast({
        title: tList("error"),
        description: tList("deleteFailed"),
        variant: "destructive"
      })
    } finally {
      setMessageToDelete(null)
    }
  }

	  useEffect(() => {
	    if (!email.id) {
	      return
	    }
	    if (bucket?.lastSyncAt && Date.now() - bucket.lastSyncAt < 30000) {
	      setLoading(false)
	      return
	    }
    void fetchMessages(undefined, { silent: Boolean(bucket?.messages?.length) })
  }, [bucket?.lastSyncAt, bucket?.messages?.length, email.id, fetchMessages])

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      setRefreshing(true)
      fetchMessages()
    }
  }, [fetchMessages, refreshTrigger])

  useEffect(() => {
    if (!emailVersion || emailVersion <= lastRefreshVersionRef.current) return
    lastRefreshVersionRef.current = emailVersion
    void fetchMessages(undefined, { silent: true })
  }, [email.id, emailVersion, fetchMessages])

  const rowHeight = 86
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 6)
  const visibleMessages = messages.slice(startIndex, startIndex + Math.ceil(viewportHeight / rowHeight) + 12)
  const total = bucket?.total || 0

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="p-2 flex justify-between items-center border-b border-primary/20">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn("h-8 w-8", refreshing && "animate-spin")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <span className="text-xs text-gray-500">
            {total > 0 ? `${total} ${t("messageCount")}` : t("noMessages")}
          </span>
        </div>

        <div ref={listRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">{t("loading")}</div>
          ) : messages.length > 0 ? (
            <div className="relative" style={{ height: messages.length * rowHeight }}>
              <div
                className="absolute left-0 right-0 divide-y divide-primary/10"
                style={{ transform: `translateY(${startIndex * rowHeight}px)` }}
              >
                {visibleMessages.map((message) => {
                  const otpCode = message.otp_code || extractOtp({ subject: message.subject, from: message.from_address }).code

                  return (
                    <div
                      key={message.id}
                      style={{ height: rowHeight }}
                      onClick={() => onMessageSelect(message.id, messageType)}
                      className={cn(
                        "overflow-hidden p-3 hover:bg-primary/5 cursor-pointer group",
                        selectedMessageId === message.id && "bg-primary/10",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Mail className="w-4 h-4 text-primary/60 mt-1" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate flex-1">{message.subject}</p>
                            {otpCode && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold tracking-widest text-primary">
                                {otpCode}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                            <span className="truncate">
                              {message.from_address || message.to_address || ""}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(message.received_at || message.sent_at || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <ShareMessageDialog
                            emailId={email.id}
                            messageId={message.id}
                            messageSubject={message.subject}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Share2 className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMessageToDelete(message)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {loadingMore && (
                <div className="text-center text-sm text-gray-500 py-2">
                  {t("loadingMore")}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-gray-500">
              {t("noMessages")}
            </div>
          )}
        </div>
      </div>
      <AlertDialog open={!!messageToDelete} onOpenChange={() => setMessageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tList("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tList("deleteDescription", { email: messageToDelete?.subject || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => messageToDelete && handleDelete(messageToDelete)}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
