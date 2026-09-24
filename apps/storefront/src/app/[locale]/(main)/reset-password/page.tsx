import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import ResetPassword from "@modules/account/components/reset-password"
import { allowsEmailLogin } from "@lib/tenant/login-settings"
import { getSiteLoginSettings } from "@lib/data/tenant-login-settings"
import { pageTitle } from "@lib/util/page-title"
import { NOINDEX } from "@lib/util/robots"

type Props = {
  searchParams: Promise<{ token?: string; email?: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.resetPassword")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
    robots: NOINDEX,
  }
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const [{ token, email }, loginSettings] = await Promise.all([
    searchParams,
    getSiteLoginSettings(),
  ])

  // o25-login-methods: a Yandex-only shop has no password to reset. The
  // backend already refuses `/auth/customer/emailpass/update` for it
  // (`login-method-gate.ts`); this is the storefront half — a stale or
  // hand-typed reset link explains itself instead of showing a form that can
  // only fail.
  if (!allowsEmailLogin(loginSettings.method)) {
    const t = await getTranslations("ResetPassword")
    return (
      <div className="w-full flex justify-center px-8 py-12">
        <div
          className="max-w-sm w-full flex flex-col items-center"
          data-testid="reset-password-unavailable"
        >
          <h1 className="text-large-semi uppercase mb-6">{t("heading")}</h1>
          <p className="text-center text-base-regular text-ui-fg-base mb-8">
            {t("notAvailable")}
          </p>
          <Link href="/account" className="underline text-small-regular">
            {t("goToSignIn")}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full flex justify-center px-8 py-12">
      <ResetPassword token={token ?? ""} email={email} />
    </div>
  )
}
