import { retrieveCart } from "@lib/data/cart"
import CartDropdown from "../cart-dropdown"

export default async function CartButton({
  variant,
}: {
  /** Passed through to `CartDropdown` (`"pill"` on branch `redesign-olavka`). */
  variant?: "icon" | "pill"
} = {}) {
  const cart = await retrieveCart().catch(() => null)

  return <CartDropdown cart={cart} variant={variant} />
}
