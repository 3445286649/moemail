"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Settings } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useState, useEffect } from "react"
import { Role, ROLES } from "@/lib/permissions"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EMAIL_CONFIG } from "@/config"

export function WebsiteConfigPanel() {
  const t = useTranslations("profile.website")
  const tCard = useTranslations("profile.card")
  const [defaultRole, setDefaultRole] = useState<string>("")
  const [emailDomains, setEmailDomains] = useState<string>("")
  const [activeEmailDomains, setActiveEmailDomains] = useState<string[]>([])
  const [adminContact, setAdminContact] = useState<string>("")
  const [maxEmails, setMaxEmails] = useState<string>(EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString())
  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("")
  const [turnstileSecretKey, setTurnstileSecretKey] = useState("")
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()


  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    const res = await fetch("/api/config")
    if (res.ok) {
      const data = await res.json() as { 
        defaultRole: Exclude<Role, typeof ROLES.EMPEROR>,
        emailDomains: string,
        activeEmailDomains?: string,
        adminContact: string,
        maxEmails: string,
        turnstile?: {
          enabled: boolean,
          siteKey: string,
          secretKey?: string
        }
      }
      setDefaultRole(data.defaultRole)
      setEmailDomains(data.emailDomains)
      setActiveEmailDomains((data.activeEmailDomains || data.emailDomains || "").split(",").map(item => item.trim()).filter(Boolean))
      setAdminContact(data.adminContact)
      setMaxEmails(data.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString())
      setTurnstileEnabled(Boolean(data.turnstile?.enabled))
      setTurnstileSiteKey(data.turnstile?.siteKey ?? "")
      setTurnstileSecretKey(data.turnstile?.secretKey ?? "")
    }
  }

  const domainList = emailDomains.split(/[,，;；\s]+/).map(item => item.trim().toLowerCase()).filter(Boolean)
  const activeDomainSet = new Set(activeEmailDomains)

  const toggleActiveDomain = (domain: string) => {
    setActiveEmailDomains(prev => prev.includes(domain) ? prev.filter(item => item !== domain) : [...prev, domain])
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          defaultRole, 
          emailDomains,
          activeEmailDomains: activeEmailDomains.filter(domain => emailDomains.split(/[,，;；\s]+/).map(item => item.trim()).filter(Boolean).includes(domain)).join(","),
          adminContact,
          maxEmails: maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
          turnstile: {
            enabled: turnstileEnabled,
            siteKey: turnstileSiteKey,
            secretKey: turnstileSecretKey
          }
        }),
      })

      if (!res.ok) throw new Error(t("saveFailed"))

      toast({
        title: t("saveSuccess"),
        description: t("saveSuccess"),
      })
    } catch (error) {
      toast({
        title: t("saveFailed"),
        description: error instanceof Error ? error.message : t("saveFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background rounded-lg border-2 border-primary/20 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm">{t("defaultRole")}:</span>
          <Select value={defaultRole} onValueChange={setDefaultRole}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROLES.DUKE}>{tCard("roles.DUKE")}</SelectItem>
              <SelectItem value={ROLES.KNIGHT}>{tCard("roles.KNIGHT")}</SelectItem>
              <SelectItem value={ROLES.CIVILIAN}>{tCard("roles.CIVILIAN")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("emailDomains")}:</span>
          <div className="flex-1">
            <Input 
              value={emailDomains}
              onChange={(e) => {
                const next = e.target.value
                setEmailDomains(next)
                const nextDomains = next.split(/[,，;；\s]+/).map(item => item.trim().toLowerCase()).filter(Boolean)
                setActiveEmailDomains(prev => prev.filter(domain => nextDomains.includes(domain)))
              }}
              placeholder={t("emailDomainsPlaceholder")}
            />
          </div>
        </div>

        <div className="rounded-lg border border-primary/20 bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" />启用生成根域名
              </div>
              <p className="mt-1 text-xs text-muted-foreground">只有勾选的域名会出现在创建邮箱和 TeamHelper 随机注册里；不影响历史邮箱继续收信。</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setActiveEmailDomains(domainList)}>全选</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setActiveEmailDomains([])}>清空</Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {domainList.map(domain => (
              <label key={domain} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${activeDomainSet.has(domain) ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-background/50 text-muted-foreground"}`}>
                <span>@{domain}</span>
                <Switch checked={activeDomainSet.has(domain)} onCheckedChange={() => toggleActiveDomain(domain)} />
              </label>
            ))}
            {!domainList.length && <div className="text-sm text-muted-foreground">先在上方填写根域名。</div>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("adminContact")}:</span>
          <div className="flex-1">
            <Input 
              value={adminContact}
              onChange={(e) => setAdminContact(e.target.value)}
              placeholder={t("adminContactPlaceholder")}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("maxEmails")}:</span>
          <div className="flex-1">
            <Input 
              type="number"
              min="1"
              max="100"
              value={maxEmails}
              onChange={(e) => setMaxEmails(e.target.value)}
              placeholder={`${EMAIL_CONFIG.MAX_ACTIVE_EMAILS}`}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-dashed border-primary/40 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="turnstile-enabled" className="text-sm font-medium">
                {t("turnstile.enable")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("turnstile.enableDescription")}
              </p>
            </div>
            <Switch
              id="turnstile-enabled"
              checked={turnstileEnabled}
              onCheckedChange={setTurnstileEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="turnstile-site-key" className="text-sm font-medium">
              {t("turnstile.siteKey")}
            </Label>
            <Input
              id="turnstile-site-key"
              value={turnstileSiteKey}
              onChange={(e) => setTurnstileSiteKey(e.target.value)}
              placeholder={t("turnstile.siteKeyPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="turnstile-secret-key" className="text-sm font-medium">
              {t("turnstile.secretKey")}
            </Label>
            <div className="relative">
              <Input
                id="turnstile-secret-key"
                type={showSecretKey ? "text" : "password"}
                value={turnstileSecretKey}
                onChange={(e) => setTurnstileSecretKey(e.target.value)}
                placeholder={t("turnstile.secretKeyPlaceholder")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowSecretKey((prev) => !prev)}
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("turnstile.secretKeyDescription")}
            </p>
          </div>
        </div>

        <Button 
          onClick={handleSave}
          disabled={loading}
          className="w-full"
        >
          {t("save")}
        </Button>
      </div>
    </div>
  )
} 
