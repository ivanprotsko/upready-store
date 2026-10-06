/**
 * What happens to the site's own cart when a page opens inside the shop's Mini
 * App and the storefront switches to the cart the buyer filled in the chat with
 * the bot (t-cherk-23, `lib/data/telegram-cart.ts`).
 *
 * The bot's cart wins. It stays as it is, with its own lines and quantities.
 * The site cart's lines are not dropped. Each one whose variant the bot's cart
 * does not hold yet is added to the bot's cart before the switch. A variant
 * both carts hold keeps the quantity the buyer set in the chat, so nothing is
 * counted twice.
 */

export type CartLine = {
  variant_id?: string | null
  quantity?: number | null
  metadata?: Record<string, unknown> | null
}

export type CarriedLine = {
  variant_id: string
  quantity: number
  metadata?: Record<string, unknown>
}

export function linesToCarry(siteLines: CartLine[], botLines: CartLine[]): CarriedLine[] {
  const inBotCart = new Set(botLines.map((line) => line.variant_id).filter(Boolean))
  const carried: CarriedLine[] = []

  for (const line of siteLines) {
    const quantity = Number(line.quantity)
    if (!line.variant_id || !(quantity > 0) || inBotCart.has(line.variant_id)) {
      continue
    }
    const metadata =
      line.metadata && Object.keys(line.metadata).length > 0 ? { metadata: line.metadata } : {}
    carried.push({ variant_id: line.variant_id, quantity, ...metadata })
  }

  return carried
}
