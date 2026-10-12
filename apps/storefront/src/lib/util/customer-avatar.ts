import { isSyntheticTelegramEmail, telegramHandle } from "./telegram-contact"

/**
 * The signed-in buyer on the checkout (t-2026-10-12-05, Ivan 12.10: «на чекауте нужно показывать
 * аватар если я залогинен а не иконку "пользователя"» and the «Вход в личный кабинет» step).
 *
 * The Yandex ID picture is kept on the customer under `yandex_avatar_id` by
 * `/api/yandex-callback` on every Yandex sign-in, so it survives the next visits and every other
 * way in. A buyer without one gets a circle with their initials.
 */

/** The customer metadata key `/api/yandex-callback` keeps Yandex's `default_avatar_id` under. */
export const YANDEX_AVATAR_KEY = "yandex_avatar_id"

/**
 * Yandex avatar ids look like `1450263/AzolHjBZ8DPtRomN7CIsMTwxk-1`: the slash is part of the
 * id, so it is checked rather than escaped. Anything else is not drawn.
 */
const AVATAR_ID = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/

type CustomerLike = {
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  metadata?: Record<string, unknown> | null
}

/** The 50 px retina picture Yandex serves for an avatar id (`islands-retina-50`). */
export const yandexAvatarUrl = (avatarId: string): string | null =>
  AVATAR_ID.test(avatarId)
    ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-retina-50`
    : null

/** The Yandex ID picture of this customer, or null when there is none to draw. */
export const customerAvatarUrl = (customer: CustomerLike | null | undefined): string | null => {
  const id = customer?.metadata?.[YANDEX_AVATAR_KEY]
  return typeof id === "string" && id.trim() ? yandexAvatarUrl(id.trim()) : null
}

/** «Имя Фамилия», either part alone, or "" when the profile has neither. */
export const customerFullName = (customer: CustomerLike | null | undefined): string =>
  [customer?.first_name, customer?.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ")

/** The address to name in the sign-in step, never Telegram's synthetic one. */
export const customerRealEmail = (customer: CustomerLike | null | undefined): string => {
  const email = customer?.email?.trim() ?? ""
  return email && !isSyntheticTelegramEmail(email) ? email : ""
}

const firstLetter = (value: string | null | undefined): string => {
  const letter = Array.from(value?.replace(/^@/, "").trim() ?? "")[0]
  return letter ? letter.toLocaleUpperCase() : ""
}

/**
 * Up to two letters for the fallback circle: the first letters of the first and last name, else
 * the e-mail's first letter, else the Telegram handle's, else "?".
 */
export const customerInitials = (customer: CustomerLike | null | undefined): string => {
  const fromName = firstLetter(customer?.first_name) + firstLetter(customer?.last_name)
  if (fromName) return fromName
  return (
    firstLetter(customerRealEmail(customer)) || firstLetter(telegramHandle(customer)) || "?"
  )
}

/**
 * Which sentence the sign-in step says for a signed-in buyer, with its values (Ivan 12.10, item
 * 6.4): the name and the address when the profile has a name, the address alone when Yandex ID
 * gave no name, and the Telegram handle for a buyer who has no real address at all.
 */
export type SignedInText =
  | { key: "signInDoneNamed"; values: { name: string; email: string } }
  | { key: "signInDoneEmail"; values: { email: string } }
  | { key: "signInDoneHandle"; values: { name: string } }

export const signedInText = (customer: CustomerLike): SignedInText => {
  const name = customerFullName(customer)
  const email = customerRealEmail(customer)
  if (email && name) return { key: "signInDoneNamed", values: { name, email } }
  if (email) return { key: "signInDoneEmail", values: { email } }
  return { key: "signInDoneHandle", values: { name: telegramHandle(customer) ?? "Telegram" } }
}
