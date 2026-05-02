"use client"

import { useCallback, useState } from "react"
import { signIn } from "next-auth/react"
import { useTranslations } from "next-intl"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Loader2, KeyRound, User2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Turnstile } from "@/components/auth/turnstile"

interface TurnstileConfigProps {
  enabled: boolean
  siteKey: string
}

interface LoginFormProps {
  turnstile?: TurnstileConfigProps
}

interface FormErrors {
  username?: string
  password?: string
  confirmPassword?: string
}

export function LoginForm({ turnstile }: LoginFormProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [turnstileToken, setTurnstileToken] = useState("")
  const [turnstileResetCounter, setTurnstileResetCounter] = useState(0)
  const { toast } = useToast()
  const t = useTranslations("auth.loginForm")

  const turnstileSiteKey = turnstile?.siteKey ?? ""
  const turnstileEnabled = Boolean(turnstile?.enabled && turnstileSiteKey)

  const resetTurnstile = useCallback(() => {
    setTurnstileToken("")
    setTurnstileResetCounter((prev) => prev + 1)
  }, [])

  const ensureTurnstileSolved = () => {
    if (!turnstileEnabled) return true
    if (turnstileToken) return true

    toast({
      title: t("toast.turnstileRequired"),
      description: t("toast.turnstileRequiredDesc"),
      variant: "destructive",
    })
    return false
  }

  const validateLoginForm = () => {
    const newErrors: FormErrors = {}
    if (!username) newErrors.username = t("errors.usernameRequired")
    if (!password) newErrors.password = t("errors.passwordRequired")
    if (username.includes('@')) newErrors.username = t("errors.usernameInvalid")
    if (password && password.length < 8) newErrors.password = t("errors.passwordTooShort")
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async () => {
    if (!validateLoginForm()) return
    if (!ensureTurnstileSolved()) return

    setLoading(true)
    try {
      const result = await signIn("credentials", {
        username,
        password,
        turnstileToken,
        redirect: false,
      })

      if (result?.error) {
        toast({
          title: t("toast.loginFailed"),
          description: result.error,
          variant: "destructive",
        })
        setLoading(false)
        resetTurnstile()
        return
      }

      window.location.href = "/"
    } catch (error) {
      toast({
        title: t("toast.loginFailed"),
        description: error instanceof Error ? error.message : t("toast.registerFailedDesc"),
        variant: "destructive",
      })
      setLoading(false)
      resetTurnstile()
    }
  }


  return (
    <Card className="w-[95%] max-w-lg border-2 border-primary/20">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-center bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
          {t("title")}
        </CardTitle>
        <CardDescription className="text-center">
          {t("subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6">
        <div className="min-h-[220px] space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <User2 className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.username && "border-destructive focus-visible:ring-destructive"
                      )}
                      placeholder={t("fields.username")}
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-xs text-destructive">{errors.username}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute left-2.5 top-2 text-muted-foreground">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <Input
                      className={cn(
                        "h-9 pl-9 pr-3",
                        errors.password && "border-destructive focus-visible:ring-destructive"
                      )}
                      type="password"
                      placeholder={t("fields.password")}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setErrors({})
                      }}
                      disabled={loading}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <Button
                  className="w-full"
                  onClick={handleLogin}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("actions.login")}
                </Button>

              </div>
        </div>
        {turnstileEnabled && turnstileSiteKey && (
          <div className="space-y-2 mt-4">
            <Turnstile
              siteKey={turnstileSiteKey}
              onVerify={setTurnstileToken}
              onExpire={resetTurnstile}
              resetSignal={turnstileResetCounter}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
