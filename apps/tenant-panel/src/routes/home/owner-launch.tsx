import { CheckCircleSolid, TriangleRightMini } from "@medusajs/icons"
import { Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useTenantPages } from "../../hooks/api/pages"
import { usePaymentSettings } from "../../hooks/api/payment-settings"
import { useProducts } from "../../hooks/api/products"
import { useRequisites } from "../../hooks/api/requisites"
import { useShippingOptions } from "../../hooks/api/shipping-options"
import { usePermissions } from "../../hooks/use-permissions"
import { PAGE_SECTIONS, statusOf } from "../pages/page-sections"

type Step = { key: string; done: boolean | null; to: string }

/**
 * «Запуск магазина» (o21-owner-panel-ux, P2): what a shop needs before it can
 * sell, each line read from the shop's own data and leading to the screen where
 * it is done. `null` means «not known yet» (the read is on its way or failed):
 * such a line is shown as not done only once the answer is in.
 */
export const OwnerLaunch = () => {
  const { t } = useTranslation()
  const quiet = { staleTime: 60_000, retry: false } as const
  // t-2026-10-07-11: a step is read and listed only for a login that may open
  // the screen where it is done; a login with no such step sees no list.
  const { can, allowed } = usePermissions()
  const catalog = { ...quiet, enabled: can("catalog") }
  const storefront = { ...quiet, enabled: can("storefront") }
  const settings = { ...quiet, enabled: can("settings") }

  const published = useProducts({ status: ["published"], limit: 1, fields: "id" }, catalog)
  const { pages } = useTenantPages(storefront)
  const requisites = useRequisites(settings)
  const payments = usePaymentSettings(settings)
  const shipping = useShippingOptions({ limit: 1, fields: "id" }, settings)

  const pagesDone = pages
    ? PAGE_SECTIONS.every((section) => {
        const page = pages.find((one) => one.key === section.key)
        return !!page && statusOf(page) !== "empty"
      })
    : null

  const account = payments.settings
  const steps: Step[] = [
    {
      key: "products",
      done: typeof published.count === "number" ? published.count > 0 : null,
      to: "/products",
    },
    { key: "pages", done: pagesDone, to: "/pages" },
    {
      key: "requisites",
      done: requisites.missing ? requisites.missing.length === 0 : null,
      to: "/settings/requisites",
    },
    {
      key: "payments",
      done: payments.isSuccess ? !!account && account.is_enabled && !account.is_test : null,
      to: "/settings/payments",
    },
    {
      key: "delivery",
      done: typeof shipping.count === "number" ? shipping.count > 0 : null,
      to: "/shipping",
    },
  ].filter((step) => allowed(step.to))

  if (steps.length === 0) {
    return null
  }

  const known = steps.filter((step) => step.done !== null)
  const left = known.filter((step) => !step.done).length

  // A shop that is fully set up does not need the list on its first screen.
  if (known.length === steps.length && left === 0) {
    return null
  }

  return (
    <Container className="divide-y p-0" data-testid="owner-launch">
      <div className="px-6 py-4">
        <Heading level="h2">{t("home.launch.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("home.launch.left", { count: left })}
        </Text>
      </div>
      {steps.map((step) => (
        <Link
          key={step.key}
          to={step.to}
          data-done={step.done ? "true" : "false"}
          className="hover:bg-ui-bg-base-hover transition-fg flex min-h-11 items-center gap-x-3 px-6 py-3 outline-none focus-visible:shadow-borders-focus"
        >
          {step.done ? (
            <CheckCircleSolid className="text-ui-tag-green-icon shrink-0" />
          ) : (
            <span className="border-ui-border-strong size-[15px] shrink-0 rounded-full border" />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <Text size="small" weight="plus">
              {t(`home.launch.${step.key}.title`)}
            </Text>
            {!step.done ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t(`home.launch.${step.key}.hint`)}
              </Text>
            ) : null}
          </div>
          <TriangleRightMini className="text-ui-fg-muted shrink-0 rtl:rotate-180" />
        </Link>
      ))}
    </Container>
  )
}
