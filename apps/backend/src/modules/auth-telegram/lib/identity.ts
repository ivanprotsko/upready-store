/**
 * How a Telegram buyer maps onto a Medusa customer, and the synthetic address
 * every other part of the backend has to recognise and hide.
 *
 * Carried over from chrxnasdmds (`tg_<id>@telegram.local`, `3e0163d8`'s
 * `resolveCustomerKey`): a Medusa customer cannot exist without an email, and
 * Telegram does not give one, so this is the placeholder. It is a KEY, never
 * shown to the buyer (`00790879`'s lesson) — the storefront substitutes the
 * Telegram handle or name wherever this would otherwise render, and
 * `smtp.ts` refuses to mail it.
 */

export const SYNTHETIC_EMAIL_DOMAIN = "telegram.local";

export const authIdentityEntityId = (telegramUserId: number | string): string =>
  `telegram:${telegramUserId}`;

export const syntheticEmailFor = (telegramUserId: number | string): string =>
  `tg_${telegramUserId}@${SYNTHETIC_EMAIL_DOMAIN}`;

/** `true` for `tg_<id>@telegram.local` (any case), never for a real address. */
export const isSyntheticTelegramEmail = (
  email: string | null | undefined,
): boolean =>
  typeof email === "string" &&
  email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);

export type TelegramUserMetadata = {
  telegram_id: number;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  telegram_photo_url: string | null;
};

/** The display name a buyer's Telegram profile gives, best field first. */
export const telegramDisplayName = (
  metadata: Pick<
    TelegramUserMetadata,
    "telegram_username" | "telegram_first_name" | "telegram_last_name"
  >,
): string | null => {
  const full = [metadata.telegram_first_name, metadata.telegram_last_name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  if (full) {
    return full;
  }
  return metadata.telegram_username ? `@${metadata.telegram_username}` : null;
};
