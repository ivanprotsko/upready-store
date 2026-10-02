/**
 * A Telegram buyer's Medusa customer carries `tg_<id>@telegram.local` as its
 * email (the backend's `auth-telegram/lib/identity.ts`): Medusa needs an
 * address and Telegram gives none. It is a key, never something to show — a
 * screen that would print it shows the Telegram @handle or name instead.
 */

const SYNTHETIC_DOMAIN = "telegram.local"

export const syntheticTelegramEmail = (telegramId: number | string): string =>
  `tg_${telegramId}@${SYNTHETIC_DOMAIN}`

export const isSyntheticTelegramEmail = (email: string | null | undefined): boolean =>
  typeof email === "string" && email.toLowerCase().endsWith(`@${SYNTHETIC_DOMAIN}`)

type ContactSource = {
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  metadata?: Record<string, unknown> | null
}

/** `@username`, else the name, else null — what Telegram knows the buyer by. */
export const telegramHandle = (customer: ContactSource | null | undefined): string | null => {
  if (!customer) {
    return null
  }
  const username = customer.metadata?.telegram_username
  if (typeof username === "string" && username.trim()) {
    return `@${username.trim()}`
  }
  const name = [customer.first_name, customer.last_name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim()
  return name || null
}

/** The email, unless it is the synthetic one: then the Telegram handle, else "Telegram". */
export const customerContactLabel = (customer: ContactSource | null | undefined): string => {
  const email = customer?.email ?? ""
  if (!isSyntheticTelegramEmail(email)) {
    return email
  }
  return telegramHandle(customer) ?? "Telegram"
}

/** A real address to prefill a form with, or "" for the synthetic one. */
export const realEmailOrEmpty = (email: string | null | undefined): string =>
  email && !isSyntheticTelegramEmail(email) ? email : ""
