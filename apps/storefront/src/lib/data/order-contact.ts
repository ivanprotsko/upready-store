import "server-only"

import { customerContactLabel, isSyntheticTelegramEmail } from "@lib/util/telegram-contact"
import { retrieveCustomer } from "./customer"

/**
 * The order's contact as a person would read it: the email, or for a Telegram
 * buyer's synthetic address the signed-in buyer's @handle (only when the order
 * is theirs), else just "Telegram".
 */
export async function orderContactLabel(email: string | null | undefined): Promise<string | null> {
  if (!email) {
    return null
  }
  if (!isSyntheticTelegramEmail(email)) {
    return email
  }
  const customer = await retrieveCustomer()
  return customer?.email?.toLowerCase() === email.toLowerCase()
    ? customerContactLabel(customer)
    : "Telegram"
}
