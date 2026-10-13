import type { Requisites } from "../../../hooks/api/requisites"

// t-2026-10-14-01 (panel redesign, G1): what the requisites page and its five
// section drawers share. The record is still one: every drawer sends the whole
// of it to `PUT /tenants/requisites`, so a drawer that shows four fields never
// blanks the other twelve.

export type RequisitesDraft = {
  [K in keyof Requisites]: Requisites[K] extends boolean ? boolean : string
}

export type RequisiteTextField = keyof Omit<RequisitesDraft, "phone_confirmed">

/** The five sections, in the prototype's order, and the fields each one owns. */
export const REQUISITES_SECTIONS = {
  seller: {
    editTo: "edit",
    fields: ["legal_name", "inn", "ogrn", "legal_address"],
  },
  contacts: {
    editTo: "edit-contacts",
    fields: ["phone", "email", "return_address", "delivery_methods"],
  },
  personal: {
    editTo: "edit-personal",
    fields: ["dpo_email", "rkn_reg_number", "rkn_notice_date"],
  },
  dates: {
    editTo: "edit-dates",
    fields: ["document_date", "effective_date", "revision_date"],
  },
  other: {
    editTo: "edit-other",
    fields: ["newsletter_management_url", "bank_details"],
  },
} as const satisfies Record<string, { editTo: string; fields: readonly RequisiteTextField[] }>

export type RequisitesSectionId = keyof typeof REQUISITES_SECTIONS

/** The platform names a missing value by its document token; this maps it to the field. */
export const TOKEN_FIELDS: Record<string, RequisiteTextField> = {
  ФИО_ИП: "legal_name",
  ОГРНИП: "ogrn",
  ИНН: "inn",
  ЮР_АДРЕС: "legal_address",
  ТЕЛЕФОН: "phone",
  EMAIL: "email",
  СПОСОБЫ_ДОСТАВКИ: "delivery_methods",
  ДАТА_ВСТУПЛЕНИЯ: "effective_date",
  ДАТА_РЕДАКЦИИ: "revision_date",
  ДАТА_УВЕДОМЛЕНИЯ_РКН: "rkn_notice_date",
  РКН_РЕГ_НОМЕР: "rkn_reg_number",
  EMAIL_ДПО: "dpo_email",
  ДАТА_ДОКУМЕНТА: "document_date",
  ССЫЛКА_УПРАВЛЕНИЯ_РАССЫЛКАМИ: "newsletter_management_url",
  АДРЕС_ВОЗВРАТА: "return_address",
}

export const toDraft = (requisites: Requisites | undefined): RequisitesDraft => ({
  legal_name: requisites?.legal_name ?? "",
  inn: requisites?.inn ?? "",
  ogrn: requisites?.ogrn ?? "",
  legal_address: requisites?.legal_address ?? "",
  return_address: requisites?.return_address ?? "",
  phone: requisites?.phone ?? "",
  phone_confirmed: requisites?.phone_confirmed ?? false,
  email: requisites?.email ?? "",
  dpo_email: requisites?.dpo_email ?? "",
  delivery_methods: requisites?.delivery_methods ?? "",
  effective_date: requisites?.effective_date ?? "",
  revision_date: requisites?.revision_date ?? "",
  document_date: requisites?.document_date ?? "",
  rkn_notice_date: requisites?.rkn_notice_date ?? "",
  rkn_reg_number: requisites?.rkn_reg_number ?? "",
  newsletter_management_url: requisites?.newsletter_management_url ?? "",
  bank_details: requisites?.bank_details ?? "",
})

// Dates are stored as free text (up to 100 characters), and the documents print
// them as written: the shop's own seed uses «01.01.2026». The date picker writes
// the same day.month.year form; text the picker cannot read (an owner typed
// «1 сентября 2026» before) stays as it is until a date is picked over it.
const DAY_MONTH_YEAR = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
const YEAR_MONTH_DAY = /^(\d{4})-(\d{2})-(\d{2})/

const validDate = (year: number, month: number, day: number): Date | null => {
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null
}

export const parseRequisiteDate = (text: string | null | undefined): Date | null => {
  const value = (text ?? "").trim()
  const dmy = DAY_MONTH_YEAR.exec(value)
  if (dmy) return validDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  const ymd = YEAR_MONTH_DAY.exec(value)
  if (ymd) return validDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))
  return null
}

export const formatRequisiteDate = (date: Date | null): string => {
  if (!date) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}
