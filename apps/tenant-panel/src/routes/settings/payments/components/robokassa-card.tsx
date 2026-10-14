import { Key, PencilSquare } from "@medusajs/icons"
import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SettingsDetail, type SettingsSection } from "../../../../components/settings"
import { usePaymentSettings } from "../../../../hooks/api/payment-settings"
import { WAY_STATE_COLOR, robokassaMethodLabel, robokassaState, wayStateKey } from "../payment-ways"
import { AddressValue } from "./address-value"
import { usePreNoticeSection } from "./payment-pre-notice-card"

// t-2026-10-14-01 (panel redesign, G3, prototype state `payments-robokassa`):
// the Robokassa card under «Оплата». It reads, in the order of design-system
// rule 17: the state (the account, whether the checkout offers it), the
// behaviour (what the old «Приём оплат» form held: the switch, test mode,
// Robokassa's own methods, the 54-FZ receipt, the signature), then the Result
// URL to paste into Robokassa. The behaviour is edited in the drawer `edit`;
// the login and the four passwords stay under «Подключение → Robokassa»
// (p01), and the card links there instead of holding a second copy.

const ACCOUNT_PAGE = "/settings/integrations/robokassa"

export const RobokassaCard = () => {
  const { t, i18n } = useTranslation()
  const {
    settings,
    unreadable,
    result_url: resultUrl,
    methods,
    robokassa_methods: robokassaMethods,
    isPending,
    isError,
    error,
  } = usePaymentSettings()
  const preNotice = usePreNoticeSection("robokassa")

  if (isError) {
    throw error
  }

  const account = settings ?? null
  const state = robokassaState(account, unreadable)
  const password = account ? (account.is_test ? account.test_password1 : account.password1) : null
  const yesNo = (value: boolean) => (value ? t("paymentMethods.yes") : t("paymentMethods.no"))

  const accountHint = (
    <>
      {t("paymentMethods.robokassa.accountHint")}{" "}
      <Link className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover" to={ACCOUNT_PAGE}>
        {t("paymentMethods.robokassa.accountLink")}
      </Link>
    </>
  )

  const openAccount = {
    label: account ? t("paymentMethods.robokassa.openAccount") : t("paymentMethods.robokassa.connect"),
    to: ACCOUNT_PAGE,
    icon: <Key />,
  }

  const stateSection: SettingsSection = {
    id: "robokassa",
    title: t("paymentMethods.ways.robokassa.title"),
    description: t("paymentMethods.ways.robokassa.description"),
    status: { color: WAY_STATE_COLOR[state], label: t(wayStateKey(state)) },
    actions: account
      ? [
          { actions: [{ label: t("actions.change"), to: "edit", icon: <PencilSquare /> }] },
          { actions: [openAccount] },
        ]
      : [{ actions: [openAccount] }],
    rows: [
      {
        id: "account",
        label: t("paymentMethods.robokassa.account"),
        value: unreadable
          ? t("paymentMethods.robokassa.accountUnreadable")
          : account
            ? password?.set
              ? t("paymentMethods.robokassa.accountConnected", { last4: password.last4 ?? "" })
              : t("paymentMethods.robokassa.accountConnectedNoPassword")
            : t("paymentMethods.robokassa.accountMissing"),
        hint: accountHint,
      },
      {
        id: "checkout",
        label: t("paymentMethods.robokassa.checkout"),
        value: methods?.robokassa
          ? t("paymentMethods.robokassa.checkoutOffered")
          : t("paymentMethods.robokassa.checkoutNotOffered"),
        hint: account?.is_enabled && account.is_test ? t("paymentMethods.robokassa.testHint") : undefined,
      },
    ],
  }

  const off = new Set(account?.disabled_methods ?? [])

  const behaviourSection: SettingsSection = {
    id: "behaviour",
    title: t("paymentMethods.robokassa.behaviour.title"),
    description: t("paymentMethods.robokassa.behaviour.description"),
    editTo: "edit",
    // Without a readable account there is nothing to behave with: the save
    // needs the account's login (`PUT /tenants/payment-settings`), so no edit.
    actions: account ? undefined : [],
    rows: account
      ? [
          { id: "is_enabled", label: t("paymentSettings.fields.is_enabled"), value: yesNo(account.is_enabled) },
          {
            id: "mode",
            label: t("paymentMethods.robokassa.mode"),
            value: account.is_test ? t("paymentMethods.robokassa.modeTest") : t("paymentMethods.robokassa.modeLive"),
          },
          {
            id: "methods",
            label: t("paymentMethods.robokassa.methods"),
            value: robokassaMethods?.length ? (
              <div className="flex flex-wrap gap-1.5" data-testid="robokassa-methods">
                {robokassaMethods.map((method) => {
                  const name = robokassaMethodLabel(t, method, i18n.language)
                  return off.has(method.alias) ? (
                    <Badge key={method.alias} size="2xsmall" color="grey">
                      {t("paymentMethods.robokassa.methodOff", { name })}
                    </Badge>
                  ) : (
                    <Badge key={method.alias} size="2xsmall" color="green">
                      {name}
                    </Badge>
                  )
                })}
              </div>
            ) : (
              t("paymentSettings.robokassaMethods.none")
            ),
            hint: t("paymentMethods.robokassa.methodsHint"),
          },
          {
            id: "fiscalization",
            label: t("paymentMethods.robokassa.fiscal"),
            value: account.fiscalization_enabled
              ? t("paymentMethods.robokassa.fiscalOn")
              : t("paymentMethods.robokassa.fiscalOff"),
            hint: t("paymentMethods.robokassa.fiscalHint"),
          },
          ...(account.fiscalization_enabled
            ? [
                { id: "sno", label: t("paymentSettings.fields.sno"), value: t(`paymentSettings.sno.${account.sno}`) },
                {
                  id: "default_tax",
                  label: t("paymentSettings.fields.default_tax"),
                  value: t(`paymentSettings.tax.${account.default_tax}`),
                },
              ]
            : []),
          {
            id: "hash_algorithm",
            label: t("paymentSettings.fields.hash_algorithm"),
            value: account.hash_algorithm.toUpperCase(),
          },
        ]
      : [
          {
            id: "is_enabled",
            label: t("paymentSettings.fields.is_enabled"),
            value: t("paymentMethods.no"),
            hint: t("paymentMethods.robokassa.noAccountHint"),
          },
        ],
  }

  const resultUrlSection: SettingsSection = {
    id: "result-url",
    title: t("paymentMethods.robokassa.resultUrl.title"),
    description: t("paymentMethods.robokassa.resultUrl.description"),
    actions: [],
    rows: [
      {
        id: "result_url",
        label: t("paymentMethods.robokassa.resultUrl.label"),
        value: resultUrl ? <AddressValue value={resultUrl} testId="robokassa-result-url" /> : null,
      },
    ],
  }

  return (
    <SettingsDetail
      isPending={isPending || preNotice.isPending}
      sections={[
        stateSection,
        behaviourSection,
        ...(preNotice.isSet ? [preNotice.section] : []),
        resultUrlSection,
      ]}
    />
  )
}
