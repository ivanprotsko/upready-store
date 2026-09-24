import type { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"
import { getSiteName } from "@lib/data/cookies"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { getSiteLoginSettings } from "@lib/data/tenant-login-settings"
import { getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.login")

  return {
    title: await pageTitle(t("title")),
    description: t("description", { siteName: await getSiteName() }),
  }
}

export default async function Login() {
  // LoginTemplate and its children (Register) are client components, so the
  // tenant's name and its legal pages cross as props rather than through the
  // header-reading accessors those modules must never import (rule 19g).
  const [siteName, legal, loginSettings] = await Promise.all([
    getSiteName(),
    getLegalLinkContext(),
    getSiteLoginSettings(),
  ])
  return (
    <LoginTemplate siteName={siteName} legal={legal} loginSettings={loginSettings} />
  )
}
