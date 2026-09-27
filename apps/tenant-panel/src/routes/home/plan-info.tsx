import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

type Tenant = {
  plan_id: string | null
  plan_trial_ends_at: string | null
}

const KNOWN_PLAN_IDS = ["novice", "pro", "master"] as const

/**
 * The shop's own tariff (t-2026-09-27-05, Ivan 2026-09-27: «работающий
 * онбординг для всех тарифов с сохраннением выбранного тарифа в личном
 * кабинете и триальной версией для платных тарифов»), read straight off
 * `GET /tenants/me` — no second call to the platform's pricing document, so
 * this never claims a tariff the tenant row does not itself carry.
 *
 * `plan_id` is null for a tenant created before the column existed, or
 * through a path that names no tariff; this renders nothing then, exactly
 * like `DeveloperDetails` treats a missing tenant.
 */
export const PlanInfo = ({ tenant }: { tenant: Tenant | undefined }) => {
  const { t, i18n } = useTranslation()

  if (!tenant?.plan_id) {
    return null
  }

  const planName = (KNOWN_PLAN_IDS as readonly string[]).includes(tenant.plan_id)
    ? t(`overview.planNames.${tenant.plan_id}`)
    : tenant.plan_id

  const trialUntil = tenant.plan_trial_ends_at
    ? new Date(tenant.plan_trial_ends_at).toLocaleDateString(i18n.language)
    : null

  return (
    <Text size="small" className="text-ui-fg-subtle" data-testid="home-plan-info">
      {t("overview.plan")}: {planName}
      {trialUntil ? ` · ${t("overview.planTrialUntil", { date: trialUntil })}` : ""}
    </Text>
  )
}
