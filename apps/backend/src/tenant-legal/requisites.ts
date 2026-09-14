/**
 * The seller-requisites resolver (t12-legal-requisites).
 *
 * The tenant's legal pages (offer, privacy, contacts — any page body, in fact)
 * carry `{{ТОКЕН}}` placeholders left in on purpose during the Cherkashina
 * migration, because nobody may invent a seller's registration data
 * (`artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md`,
 * row "Реквизиты", 16 distinct tokens). This module is the ONE place that
 * turns a stored `tenant_requisites` row into those 16 values and back into
 * rendered text, so every consumer (today: `GET /store/tenant/pages/:key`)
 * gets the same result and an unfilled token keeps rendering literally — that
 * is the deliberate "not filled" signal the step plan asks to preserve.
 *
 * `{{ДОМЕН_САЙТА}}` is not a column on the model: it is always resolved from
 * the tenant's own primary host by the caller and handed in alongside the
 * stored values, so it can never fall out of step with `canonical`/`sitemap`.
 */

export type RequisitesRow = {
  legal_name: string | null;
  inn: string | null;
  ogrn: string | null;
  legal_address: string | null;
  return_address: string | null;
  phone: string | null;
  phone_confirmed: boolean;
  email: string | null;
  dpo_email: string | null;
  delivery_methods: string | null;
  effective_date: string | null;
  revision_date: string | null;
  document_date: string | null;
  rkn_notice_date: string | null;
  rkn_reg_number: string | null;
  newsletter_management_url: string | null;
  bank_details: string | null;
};

/** The 15 tokens backed by a `tenant_requisites` column, mapped to that column. */
export const LEGAL_TOKEN_FIELDS = {
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
} as const satisfies Record<string, keyof RequisitesRow>;

export type StoredLegalToken = keyof typeof LEGAL_TOKEN_FIELDS;

/** The 16th token: resolved from the tenant's primary host, never stored. */
export const DOMAIN_TOKEN = "ДОМЕН_САЙТА" as const;

export type LegalToken = StoredLegalToken | typeof DOMAIN_TOKEN;

/** Plain-Russian label for the panel's "не заполнено" list, never the token itself (rule 18e). */
export const LEGAL_TOKEN_LABELS: Record<LegalToken, string> = {
  ФИО_ИП: "ФИО ИП или название организации",
  ОГРНИП: "ОГРНИП / ОГРН",
  ИНН: "ИНН",
  ЮР_АДРЕС: "Юридический адрес",
  ТЕЛЕФОН: "Телефон",
  EMAIL: "E-mail",
  СПОСОБЫ_ДОСТАВКИ: "Способы доставки",
  ДАТА_ВСТУПЛЕНИЯ: "Дата вступления документа в силу",
  ДАТА_РЕДАКЦИИ: "Дата редакции документа",
  ДАТА_УВЕДОМЛЕНИЯ_РКН: "Дата уведомления Роскомнадзора",
  РКН_РЕГ_НОМЕР: "Регистрационный номер в реестре Роскомнадзора (ПДн)",
  EMAIL_ДПО: "E-mail ответственного за обработку персональных данных",
  ДОМЕН_САЙТА: "Домен сайта",
  ДАТА_ДОКУМЕНТА: "Дата документа",
  ССЫЛКА_УПРАВЛЕНИЯ_РАССЫЛКАМИ: "Ссылка на управление рассылками",
  АДРЕС_ВОЗВРАТА: "Адрес возврата",
};

export const LEGAL_TOKENS: LegalToken[] = [
  ...(Object.keys(LEGAL_TOKEN_FIELDS) as StoredLegalToken[]),
  DOMAIN_TOKEN,
];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokenPattern = (): RegExp =>
  new RegExp(`\\{\\{(${LEGAL_TOKENS.map(escapeRegExp).join("|")})\\}\\}`, "g");

/**
 * One value per of the 16 tokens: the stored row's fields plus the resolved
 * domain.
 *
 * `{{ТЕЛЕФОН}}` is withheld while `phone_confirmed` is false, even when a
 * number is on file: an unconfirmed phone must not read as a settled fact on
 * a public offer (worker brief, "What NOT to do" and the cherkashino seed's
 * own note on `+7 (911) 718-01-23`). It still renders literally until
 * confirmed and counts toward the panel's "не заполнено" list — confirming
 * it in the panel is what fills it in, not writing the digits alone.
 */
export const valuesFromRequisites = (
  row: RequisitesRow | null,
  domain: string | null,
): Record<LegalToken, string | null> => {
  const values = {} as Record<LegalToken, string | null>;
  for (const [token, field] of Object.entries(LEGAL_TOKEN_FIELDS) as [StoredLegalToken, keyof RequisitesRow][]) {
    const raw = row?.[field];
    values[token] = typeof raw === "string" ? raw : null;
  }
  if (!row?.phone_confirmed) {
    values.ТЕЛЕФОН = null;
  }
  values[DOMAIN_TOKEN] = domain;
  return values;
};

/**
 * Replaces every `{{ТОКЕН}}` this module knows about with its value, when the
 * value is non-blank. A token with no value, or one this module does not
 * know, is left exactly as written — the literal braces ARE the "not filled"
 * signal on the page, and it must survive (step plan, piece 2).
 */
export const resolveLegalPlaceholders = (
  body: string,
  values: Record<string, string | null | undefined>,
): string =>
  body.replace(tokenPattern(), (match, token: string) => {
    const value = values[token];
    return value && value.trim().length > 0 ? value : match;
  });

/** The tokens still unfilled, in the list's own canonical order. */
export const missingLegalTokens = (
  row: RequisitesRow | null,
  domain: string | null,
): LegalToken[] => {
  const values = valuesFromRequisites(row, domain);
  return LEGAL_TOKENS.filter((token) => {
    const value = values[token];
    return !value || value.trim().length === 0;
  });
};

/** Every known token that appears, literally, in one page body. */
export const tokensInText = (body: string): LegalToken[] => {
  const found = new Set<LegalToken>();
  let match: RegExpExecArray | null;
  const pattern = tokenPattern();
  while ((match = pattern.exec(body))) {
    found.add(match[1] as LegalToken);
  }
  return [...found];
};
