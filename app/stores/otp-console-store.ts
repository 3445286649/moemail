"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export interface OtpEmail {
  id: string
  address: string
  createdAt: number
  expiresAt: number
  batchId?: string | null
  batchName?: string | null
  tags?: string[]
  used?: boolean
  messageCount: number
  latestMessageId?: string | null
  latestSubject?: string | null
  latestFrom?: string | null
  latestReceivedAt?: number | null
  latestCode?: string | null
  latestPreview?: string | null
  provider?: string
  confidence?: number
  updatedAt?: number | null
}

export interface OtpBatch {
  id: string
  name: string
  source: string
  createdAt: number
  updatedAt: number
  emailCount: number
  usedCount: number
  messageCount: number
  latestReceivedAt?: number | null
}

export interface HealthCheck {
  key: string
  label: string
  status: "ok" | "warn" | "error"
  detail: string
}

export interface OtpListSummary {
  version: number
  total: number
  messageCount: number
  codeCount: number
  receivedCount: number
  emptyCount: number
  usedCount: number
  latestReceivedAt?: number | null
  statusCounts: {
    all: number
    new: number
    code: number
    empty: number
    used: number
  }
}

export interface OtpPagination {
  page: number
  pageSize: number
  offset: number
  total: number
  totalPages: number
  hasMore: boolean
}

const emptySummary: OtpListSummary = {
  version: 0,
  total: 0,
  messageCount: 0,
  codeCount: 0,
  receivedCount: 0,
  emptyCount: 0,
  usedCount: 0,
  latestReceivedAt: null,
  statusCounts: {
    all: 0,
    new: 0,
    code: 0,
    empty: 0,
    used: 0,
  },
}

const emptyPagination: OtpPagination = {
  page: 1,
  pageSize: 50,
  offset: 0,
  total: 0,
  totalPages: 1,
  hasMore: false,
}

interface OtpConsoleStore {
  emails: OtpEmail[]
  batches: OtpBatch[]
  domains: string[]
  health: HealthCheck[]
  summary: OtpListSummary
  pagination: OtpPagination
  listKey: string
  listVersion: number
  lastSyncAt: number | null
  lastStaticSyncAt: number | null
  hydrated: boolean
  setEmails: (emails: OtpEmail[], summary: OtpListSummary, pagination: OtpPagination, listKey: string) => void
  setSummary: (summary: OtpListSummary) => void
  setBatches: (batches: OtpBatch[]) => void
  setDomains: (domains: string[]) => void
  setHealth: (health: HealthCheck[]) => void
  setHydrated: (hydrated: boolean) => void
}

export const useOtpConsoleStore = create<OtpConsoleStore>()(
  persist(
    (set) => ({
      emails: [],
      batches: [],
      domains: [],
      health: [],
      summary: emptySummary,
      pagination: emptyPagination,
      listKey: "",
      listVersion: 0,
      lastSyncAt: null,
      lastStaticSyncAt: null,
      hydrated: false,
      setEmails: (emails, summary, pagination, listKey) => set({
        emails,
        listKey,
        summary,
        pagination,
        listVersion: summary.version,
        lastSyncAt: Date.now(),
      }),
      setSummary: (summary) => set({
        summary,
        listVersion: summary.version,
      }),
      setBatches: (batches) => set({
        batches,
        lastStaticSyncAt: Date.now(),
      }),
      setDomains: (domains) => set({
        domains,
        lastStaticSyncAt: Date.now(),
      }),
      setHealth: (health) => set({ health }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "moemail-otp-console-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        emails: state.emails,
        batches: state.batches,
        domains: state.domains,
        health: state.health,
        summary: state.summary,
        pagination: state.pagination,
        listKey: state.listKey,
        listVersion: state.listVersion,
        lastSyncAt: state.lastSyncAt,
        lastStaticSyncAt: state.lastStaticSyncAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    },
  ),
)
