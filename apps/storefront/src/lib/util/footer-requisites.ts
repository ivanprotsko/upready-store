import type { TenantSeller } from "@lib/data/tenant-seller"

/**
 * The seller's requisites line of the Olavka footer and the switch it sits behind
 * (t-2026-10-08-13).
 *
 * Ivan, 03.10.2026: «никаких ссылок на ИП Черкашина и т.д. Быть не должно». That holds
 * wherever the switch is off. Robokassa moderates a shop only when «Реквизиты продавца …
 * размещены в подвале сайта», so since 08.10.2026 a deployment turns the line on with
 * `STOREFRONT_FOOTER_REQUISITES=1`.
 *
 * Pure on purpose, with no `next/headers` and no fetch, so `footer-requisites.test.ts`
 * covers every rule here.
 */
export const FOOTER_REQUISITES_ENV = "STOREFRONT_FOOTER_REQUISITES"

type Env = Record<string, string | undefined>

/**
 * On for `1` and for `true`, off for everything else. The storefront reads it on the
 * server at render time, so you flip it with the container's environment and a restart,
 * with no rebuild.
 */
export const footerRequisitesEnabled = (env: Env = process.env): boolean => {
  const value = (env[FOOTER_REQUISITES_ENV] ?? "").trim().toLowerCase()
  return value === "1" || value === "true"
}

/** An ОГРНИП, the registration number of a sole trader, has 15 digits. An ОГРН of a company has 13. */
export const isSoleTraderRegNumber = (regNumber: string | null | undefined): boolean =>
  /^\d{15}$/.test((regNumber ?? "").replace(/\s+/g, ""))

/**
 * A legal form the name already carries. An abbreviation counts only in capitals and as a
 * word of its own, with no letter or digit on either side. The letters are listed by hand,
 * because this package compiles for a target without the `u` flag.
 */
const FORM_ABBREVIATION =
  /(?:^|[^A-Za-zА-Яа-яЁё0-9])(?:ИП|ООО|АО|ПАО|ЗАО|ОАО)(?![A-Za-zА-Яа-яЁё0-9])/
const FORM_IN_WORDS = /индивидуальный\s+предприниматель/i

/**
 * The seller's name the way a requisites line prints it. The panel stores a sole trader's
 * name without the form («Черкашина Оксана Ивановна»), so «ИП» goes in front of it, and
 * only when both hold: the name carries no form of its own and the registration number is
 * an ОГРНИП. Every other name is printed as the owner typed it. «ИП» is a part of the legal
 * name, which no locale translates, so it is not a catalog string.
 */
export const sellerNameWithForm = (
  legalName: string | null | undefined,
  regNumber: string | null | undefined
): string | null => {
  const name = (legalName ?? "").trim()
  if (!name) {
    return null
  }
  const hasOwnForm = FORM_ABBREVIATION.test(name) || FORM_IN_WORDS.test(name)
  return !hasOwnForm && isSoleTraderRegNumber(regNumber) ? `ИП ${name}` : name
}

export type FooterRequisitesLabels = {
  /** `Footer.taxId` */
  taxId: (value: string) => string
  /** `Footer.regNumber`, for a company's ОГРН */
  regNumber: (value: string) => string
  /** `Footer.regNumberSoleTrader`, for a sole trader's ОГРНИП */
  regNumberSoleTrader: (value: string) => string
}

type SellerRequisites = Pick<TenantSeller, "legal_name" | "inn" | "ogrn" | "legal_address">

/**
 * The pieces of the line, in the order it prints them: the name, the registration number,
 * the tax number, then the legal address when the owner filled it. A field the owner left
 * empty is skipped, and a seller with none of them gives an empty list.
 */
export const footerRequisitesParts = (
  seller: SellerRequisites | null | undefined,
  labels: FooterRequisitesLabels
): string[] => {
  const regNumber = (seller?.ogrn ?? "").trim()
  const taxId = (seller?.inn ?? "").trim()
  const address = (seller?.legal_address ?? "").trim()

  return [
    sellerNameWithForm(seller?.legal_name, regNumber),
    regNumber
      ? isSoleTraderRegNumber(regNumber)
        ? labels.regNumberSoleTrader(regNumber)
        : labels.regNumber(regNumber)
      : null,
    taxId ? labels.taxId(taxId) : null,
    address || null,
  ].filter((part): part is string => Boolean(part))
}

/** What the footer prints: the pieces above with the switch on, nothing with it off. */
export const footerRequisitesLine = (
  seller: SellerRequisites | null | undefined,
  labels: FooterRequisitesLabels,
  env: Env = process.env
): string[] => (footerRequisitesEnabled(env) ? footerRequisitesParts(seller, labels) : [])
