import type { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"
import { getSiteName } from "@lib/data/cookies"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { getSiteLoginSettings } from "@lib/data/tenant-login-settings"
import { getTelegramBot } from "@lib/data/telegram-bot"
import { getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.login")

  return {
    title: await pageTitle(t("title")),
    description: t("description", { siteName: await getSiteName() }),
  }
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Login({ searchParams }: Props) {
  // LoginTemplate and its children (Register) are client components, so the
  // tenant's name and its legal pages cross as props rather than through the
  // header-reading accessors those modules must never import (rule 19g).
  const [siteName, legal, loginSettings, telegramBot, params] = await Promise.all([
    getSiteName(),
    getLegalLinkContext(),
    getSiteLoginSettings(),
    getTelegramBot(),
    searchParams,
  ])
  // Where the buyer started the login from (cart/checkout's sign-in entries
  // set it, `lib/util/return-path.ts`); `login`/`signup` sanitise it again
  // before redirecting, so a hostile value here is harmless.
  const rawReturn = params.return
  const returnTo = (Array.isArray(rawReturn) ? rawReturn[0] : rawReturn) ?? null
  return (
    <LoginTemplate
      siteName={siteName}
      legal={legal}
      loginSettings={loginSettings}
      telegramBot={telegramBot}
      returnTo={returnTo}
    />
  )
}
