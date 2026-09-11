import type { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"
import { getSiteName } from "@lib/data/cookies"
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
  // tenant's name crosses as a prop rather than through the header-reading
  // accessor those modules must never import (rule 19g).
  const siteName = await getSiteName()
  return <LoginTemplate siteName={siteName} />
}
