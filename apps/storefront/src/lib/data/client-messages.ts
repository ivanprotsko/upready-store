import "server-only"
import { cache } from "react"
import { cookies as nextCookies } from "next/headers"
import type { AbstractIntlMessages } from "next-intl"
import { getMessages } from "next-intl/server"

import { getTenantAnalytics } from "@lib/data/analytics"
import { getTenantHandle } from "@lib/data/cookies"
import { getTenantManualPayment } from "@lib/data/tenant-manual-payment"
import { getSitePaymentMethods } from "@lib/data/tenant-payment-methods"
import { clientMessageFacts, clientMessages } from "@lib/util/client-messages"

/**
 * The dictionary both `NextIntlClientProvider`s hand to the browser (t-2026-10-08-13, part
 * A6): the request's catalogue without the strings of what this shop has switched off
 * (`lib/util/client-messages.ts` holds the table and the reasons).
 *
 * Every fact is read from what the middleware already put on the request, the same headers
 * the checkout and the root layout read, and from one cookie. No backend call is added to a
 * page.
 *
 * Behind `cache` so the root layout and `[locale]/layout.tsx` get the SAME object in one
 * request, as they did from `getMessages()`: React then writes the dictionary into the page
 * once and refers to it the second time.
 */
export const getClientMessages = cache(async (): Promise<AbstractIntlMessages> => {
  const [messages, handle, paymentMethods, manualPayment, analytics, cookies] = await Promise.all([
    getMessages(),
    getTenantHandle(),
    getSitePaymentMethods(),
    getTenantManualPayment(),
    getTenantAnalytics(),
    nextCookies(),
  ])

  return clientMessages(
    messages,
    clientMessageFacts({
      shop: handle !== null,
      paymentMethods,
      manualPayment,
      analytics,
      // The cookie `OrderCompletedTemplate` reads before it mounts `OnboardingCta`.
      onboarding: cookies.get("_medusa_onboarding")?.value === "true",
    })
  )
})
