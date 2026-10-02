import { Button, Text } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

import AccountLink from "@modules/layout/components/account-link"

/**
 * Batch 6, Q3.1: a guest whose cart holds an online course signs in (or registers,
 * on the same page) before paying — the course is granted to the order's customer
 * (`grant-course-on-paid`), a guest order gets nothing. `AccountLink` carries the
 * checkout path in `?return=`, and `login`/`signup` transfer the cart to the account
 * and come back here (`lib/data/customer.ts`). Goods alone need no account.
 */
export default async function CourseSignIn() {
  const t = await getTranslations("CheckoutPage")

  return (
    <div
      className="flex flex-col gap-y-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
      data-testid="checkout-course-sign-in"
    >
      <h2 className="h2-docs">{t("courseSignInHeading")}</h2>
      <Text size="small" className="text-ui-fg-subtle">
        {t("courseSignInText")}
      </Text>
      <div>
        <AccountLink>
          <Button variant="primary" size="large" data-testid="checkout-course-sign-in-button">
            {t("signIn")}
          </Button>
        </AccountLink>
      </div>
    </div>
  )
}
