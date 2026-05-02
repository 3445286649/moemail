"use client"

import { create } from "zustand"
import { Role, ROLES } from "@/lib/permissions"
import { EMAIL_CONFIG } from "@/config"
import { useEffect } from "react"

interface Config {
  defaultRole: Exclude<Role, typeof ROLES.EMPEROR>
  emailDomains: string
  emailDomainsArray: string[]
  allEmailDomainsArray: string[]
  activeEmailDomains: string
  activeEmailDomainsArray: string[]
  adminContact: string
  maxEmails: number
}

interface ConfigStore {
  config: Config | null
  loading: boolean
  error: string | null
  fetch: () => Promise<void>
}

let configRequest: Promise<void> | null = null

const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  loading: false,
  error: null,
  fetch: async () => {
    if (configRequest) return configRequest
    configRequest = (async () => {
    try {
      set({ loading: true, error: null })
      const res = await fetch("/api/config")
      if (!res.ok) throw new Error("获取配置失败")
      const data = await res.json() as Config
      const allDomains = String(data.emailDomains || "").split(',').map(item => item.trim()).filter(Boolean)
      const activeDomains = String(data.activeEmailDomains || data.emailDomains || "").split(',').map(item => item.trim()).filter(Boolean)
      set({
        config: {
          defaultRole: data.defaultRole || ROLES.CIVILIAN,
          emailDomains: data.emailDomains,
          emailDomainsArray: activeDomains,
          allEmailDomainsArray: allDomains,
          activeEmailDomains: data.activeEmailDomains || data.emailDomains,
          activeEmailDomainsArray: activeDomains,
          adminContact: data.adminContact || "",
          maxEmails: Number(data.maxEmails) || EMAIL_CONFIG.MAX_ACTIVE_EMAILS
        },
        loading: false
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "获取配置失败",
        loading: false
      })
    } finally {
      configRequest = null
    }
    })()
    return configRequest
  }
}))

export function useConfig() {
  const store = useConfigStore()
  const { config, loading, fetch } = store

  useEffect(() => {
    if (!config && !loading) {
      fetch()
    }
  }, [config, loading, fetch])

  return store
}
