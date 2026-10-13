import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import {
  SettingsDetail,
  type SettingsRow,
  type SettingsSection,
} from "../../../components/settings"
import { useRequisites } from "../../../hooks/api/requisites"
import { useDate } from "../../../hooks/use-date"
import {
  parseRequisiteDate,
  REQUISITES_SECTIONS,
  type RequisiteTextField,
  TOKEN_FIELDS,
  toDraft,
} from "./requisites-model"

// Реквизиты продавца (t12-legal-requisites): значения, которые на витрине
// заполняют {{ТОКЕНЫ}}, оставленные в оферте, политике конфиденциальности и
// контактах. Каждое поле необязательно — придумывать регистрационные данные
// нельзя, поэтому пустое поле не блокирует сохранение, а только помечено
// «не заполнено» и подписано страницами, которым оно нужно.
//
// t-2026-10-14-01 (panel redesign, G1): the page only reads. Five sections in
// the order of the prototype (who sells → contacts → personal data → document
// dates → other), each edited in its own drawer on its own nested route.

const MONO_FIELDS: readonly RequisiteTextField[] = [
  "inn",
  "ogrn",
  "rkn_reg_number",
  "newsletter_management_url",
]
const DATE_FIELDS: readonly RequisiteTextField[] = [
  "document_date",
  "effective_date",
  "revision_date",
  "rkn_notice_date",
]

export const RequisitesSettings = () => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { requisites, domain, missing, hidden_blocks, isPending, isError, error } = useRequisites()

  if (isError) {
    throw error
  }

  const draft = toDraft(requisites)

  // The pages that need each empty field, as the platform names them.
  const pagesByField = new Map<RequisiteTextField, string[]>()
  for (const item of missing ?? []) {
    const field = TOKEN_FIELDS[item.token]
    if (field) pagesByField.set(field, item.pages.map((page) => page.title))
  }

  const formatDate = (text: string) => {
    const date = parseRequisiteDate(text)
    return date ? getFullDate({ date }) : text
  }

  const fieldRow = (field: RequisiteTextField): SettingsRow => {
    const text = draft[field].trim()
    const label = t(`requisitesSettings.fields.${field}.label`)
    const pages = pagesByField.get(field) ?? []

    if (!text) {
      return {
        id: field,
        label,
        status: { color: "orange", label: t("requisitesSettings.notFilled") },
        hint:
          field === "return_address"
            ? t("requisitesSettings.returnAddressOptional")
            : pages.length
              ? t("requisitesSettings.neededOn", { count: pages.length, pages: pages.join(", ") })
              : undefined,
      }
    }

    return {
      id: field,
      label,
      value: DATE_FIELDS.includes(field) ? formatDate(text) : text,
      mono: MONO_FIELDS.includes(field),
    }
  }

  const rowsOf = (section: keyof typeof REQUISITES_SECTIONS): SettingsRow[] =>
    REQUISITES_SECTIONS[section].fields.map(fieldRow).map((row) => {
      if (row.id === "phone" && draft.phone.trim() && !draft.phone_confirmed) {
        return {
          ...row,
          status: { color: "orange", label: t("requisitesSettings.phoneNeedsConfirm") },
          hint: t("requisitesSettings.phoneConfirmHint"),
        }
      }
      if (row.id === "bank_details") {
        return draft.bank_details.trim()
          ? {
              ...row,
              value: (
                <Text size="small" leading="compact" className="whitespace-pre-line">
                  {draft.bank_details}
                </Text>
              ),
            }
          : { id: row.id, label: row.label, hint: t("requisitesSettings.fields.bank_details.hint") }
      }
      return row
    })

  const missingCount = missing?.length ?? 0
  const locales = new Set((hidden_blocks ?? []).map((page) => page.locale))

  const hiddenRow: SettingsRow[] = hidden_blocks?.length
    ? [
        {
          id: "hidden_blocks",
          label: t("requisitesSettings.hidden.label"),
          value: (
            <div className="flex flex-col gap-y-1" data-testid="hidden-blocks">
              {hidden_blocks.map((page) => (
                <Text key={`${page.key}-${page.locale}`} size="small" leading="compact">
                  {t("requisitesSettings.hidden.item", { title: page.title, count: page.hidden })}
                  {locales.size > 1 ? ` (${page.locale})` : ""}
                </Text>
              ))}
            </div>
          ),
          hint: t("requisitesSettings.hidden.hint"),
        },
      ]
    : []

  const sections: SettingsSection[] = [
    {
      id: "seller",
      title: t("requisitesSettings.title"),
      description: t("requisitesSettings.subtitle"),
      editTo: REQUISITES_SECTIONS.seller.editTo,
      status: missingCount
        ? { color: "orange", label: t("requisitesSettings.missingCount", { count: missingCount }) }
        : { color: "green", label: t("requisitesSettings.allFilled") },
      rows: [...hiddenRow, ...rowsOf("seller")],
    },
    {
      id: "contacts",
      title: t("requisitesSettings.sections.contacts.title"),
      description: t("requisitesSettings.sections.contacts.description"),
      editTo: REQUISITES_SECTIONS.contacts.editTo,
      rows: rowsOf("contacts"),
    },
    {
      id: "personal",
      title: t("requisitesSettings.sections.personal.title"),
      description: t("requisitesSettings.sections.personal.description"),
      editTo: REQUISITES_SECTIONS.personal.editTo,
      rows: rowsOf("personal"),
    },
    {
      id: "dates",
      title: t("requisitesSettings.sections.dates.title"),
      description: t("requisitesSettings.sections.dates.description"),
      editTo: REQUISITES_SECTIONS.dates.editTo,
      rows: rowsOf("dates"),
    },
    {
      id: "other",
      title: t("requisitesSettings.sections.other.title"),
      description: t("requisitesSettings.sections.other.description"),
      editTo: REQUISITES_SECTIONS.other.editTo,
      rows: [
        ...rowsOf("other"),
        {
          id: "domain",
          label: t("requisitesSettings.domain.label"),
          value: domain || null,
          hint: t("requisitesSettings.domain.hint"),
        },
      ],
    },
  ]

  return <SettingsDetail isPending={isPending} sections={sections} />
}
