"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

const MAX_CACHED_EMAILS = 200
const MAX_CACHED_MESSAGES_PER_BUCKET = 120
const MAX_MESSAGE_DETAILS = 20
const LEGACY_STORAGE_KEY = "moemail-mailbox-v1"

export interface MailboxEmail {
  id: string
  address: string
  createdAt: number
  expiresAt: number
  messageCount?: number
  latestCode?: string | null
  latestSubject?: string | null
  latestReceivedAt?: number | null
  latestFrom?: string | null
  provider?: string | null
  confidence?: number | null
}

export interface MailboxMessage {
  id: string
  from_address?: string | null
  to_address?: string | null
  subject: string
  received_at?: number | null
  sent_at?: number | null
  content?: string | null
  html?: string | null
  otp_code?: string | null
  otp_provider?: string | null
  otp_confidence?: number | null
}

export interface MailboxMessageDetail extends MailboxMessage {
  content: string
  html?: string | null
}

interface MessageBucket {
  messages: MailboxMessage[]
  nextCursor: string | null
  total: number
  lastSyncAt: number | null
}

interface MailboxStore {
  emails: MailboxEmail[]
  emailNextCursor: string | null
  emailTotal: number
  emailListKey: string
  emailOwnerId: string | null
  emailVersion: number
  emailLastSyncAt: number | null
  messageBuckets: Record<string, MessageBucket>
  messageDetails: Record<string, MailboxMessageDetail>
  messageDetailOrder: string[]
  hydrated: boolean
  setEmails: (payload: {
    emails: MailboxEmail[]
    nextCursor: string | null
	    total: number
	    listKey: string
	    ownerId: string
	    version: number
	    append?: boolean
	  }) => void
  upsertEmail: (email: MailboxEmail) => void
  removeEmail: (id: string) => void
  setMessages: (key: string, messages: MailboxMessage[], nextCursor: string | null, total: number, append?: boolean) => void
  removeMessage: (key: string, id: string) => void
  setMessageDetail: (key: string, message: MailboxMessageDetail) => void
  setHydrated: (hydrated: boolean) => void
  resetForOwner: (ownerId: string) => void
}

export function messageBucketKey(emailId: string, type: "received" | "sent") {
  return `${emailId}:${type}`
}

export function messageDetailKey(emailId: string, messageId: string, type: "received" | "sent") {
  return `${emailId}:${messageId}:${type}`
}

export const useMailboxStore = create<MailboxStore>()(
  persist(
    (set) => ({
      emails: [],
      emailNextCursor: null,
	      emailTotal: 0,
	      emailListKey: "",
	      emailOwnerId: null,
	      emailVersion: 0,
	      emailLastSyncAt: null,
      messageBuckets: {},
      messageDetails: {},
      messageDetailOrder: [],
      hydrated: false,
	      setEmails: ({ emails, nextCursor, total, listKey, ownerId, version, append }) => set((state) => {
	        const merged = append
	          ? [...state.emails, ...emails].filter((email, index, list) => list.findIndex(item => item.id === email.id) === index)
	          : emails

        return {
          emails: merged.slice(0, MAX_CACHED_EMAILS),
	          emailNextCursor: nextCursor,
	          emailTotal: total,
	          emailListKey: listKey,
	          emailOwnerId: ownerId,
	          emailVersion: version,
	          emailLastSyncAt: Date.now(),
	        }
      }),
      upsertEmail: (email) => set((state) => ({
        emails: [email, ...state.emails.filter(item => item.id !== email.id)].slice(0, MAX_CACHED_EMAILS),
        emailTotal: state.emails.some(item => item.id === email.id) ? state.emailTotal : state.emailTotal + 1,
        emailVersion: Math.max(state.emailVersion, Date.now()),
        emailLastSyncAt: Date.now(),
      })),
      removeEmail: (id) => set((state) => ({
        emails: state.emails.filter(item => item.id !== id),
        emailTotal: Math.max(0, state.emailTotal - 1),
        emailVersion: Math.max(state.emailVersion, Date.now()),
        emailLastSyncAt: Date.now(),
      })),
      setMessages: (key, messages, nextCursor, total, append) => set((state) => {
        const current = state.messageBuckets[key]?.messages || []
        const merged = append
          ? [...current, ...messages].filter((message, index, list) => list.findIndex(item => item.id === message.id) === index)
          : messages

        return {
          messageBuckets: {
            ...state.messageBuckets,
            [key]: {
              messages: merged.slice(0, MAX_CACHED_MESSAGES_PER_BUCKET),
              nextCursor,
              total,
              lastSyncAt: Date.now(),
            },
          },
        }
      }),
      removeMessage: (key, id) => set((state) => {
        const bucket = state.messageBuckets[key]
        if (!bucket) return state
        return {
          messageBuckets: {
            ...state.messageBuckets,
            [key]: {
              ...bucket,
              messages: bucket.messages.filter(item => item.id !== id),
              total: Math.max(0, bucket.total - 1),
              lastSyncAt: Date.now(),
            },
          },
          messageDetails: Object.fromEntries(
            Object.entries(state.messageDetails).filter(([detailKey]) => !detailKey.startsWith(`${key.split(":")[0]}:${id}:`)),
          ),
          messageDetailOrder: state.messageDetailOrder.filter(detailKey => !detailKey.startsWith(`${key.split(":")[0]}:${id}:`)),
        }
      }),
      setMessageDetail: (key, message) => set((state) => {
        const order = [key, ...state.messageDetailOrder.filter(item => item !== key)].slice(0, MAX_MESSAGE_DETAILS)
        const allowed = new Set(order)
        const details = {
          ...state.messageDetails,
          [key]: message,
        }

        return {
          messageDetails: Object.fromEntries(Object.entries(details).filter(([detailKey]) => allowed.has(detailKey))),
          messageDetailOrder: order,
        }
	      }),
	      setHydrated: (hydrated) => set({ hydrated }),
	      resetForOwner: (ownerId) => set((state) => {
	        if (state.emailOwnerId === ownerId) return state
	        return {
	          emails: [],
	          emailNextCursor: null,
	          emailTotal: 0,
	          emailListKey: "",
	          emailOwnerId: ownerId,
	          emailVersion: 0,
	          emailLastSyncAt: null,
	          messageBuckets: {},
	          messageDetails: {},
	          messageDetailOrder: [],
	        }
	      }),
	    }),
    {
      name: "moemail-mailbox-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        emails: state.emails,
        emailNextCursor: state.emailNextCursor,
	        emailTotal: state.emailTotal,
	        emailListKey: state.emailListKey,
	        emailOwnerId: state.emailOwnerId,
	        emailVersion: state.emailVersion,
        emailLastSyncAt: state.emailLastSyncAt,
        messageBuckets: state.messageBuckets,
      }),
      onRehydrateStorage: () => (state) => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(LEGACY_STORAGE_KEY)
        }
        state?.setHydrated(true)
      },
    },
  ),
)
