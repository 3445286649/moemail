import { OtpConsole } from "@/components/otp/otp-console"
import { NoPermissionDialog } from "@/components/no-permission-dialog"
import { auth, checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { redirect } from "next/navigation"
import type { Locale } from "@/i18n/config"

export const runtime = "edge"

export default async function OtpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeFromParams } = await params
  const locale = localeFromParams as Locale
  const session = await auth()

  if (!session?.user) {
    redirect(`/${locale}`)
  }

  const hasPermission = await checkPermission(PERMISSIONS.MANAGE_EMAIL)

  return (
    <div className="min-h-screen">
      <OtpConsole
        locale={locale}
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
      />
      {!hasPermission && <NoPermissionDialog />}
    </div>
  )
}
