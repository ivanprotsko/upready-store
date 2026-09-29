import { retrieveCart } from "@lib/data/cart"
import HydrationSlot from "@modules/common/components/hydration-slot"
import CartDropdown from "../cart-dropdown"

// Every header variant and the bottom nav put this straight into a `<div>`;
// being async, it reaches the RSC payload as a lazy row, so the slot keeps
// that lazy off the `<div>`'s own children (46df U-06, HydrationSlot).
export default function CartButton() {
  return (
    <HydrationSlot>
      <CartButtonContent />
    </HydrationSlot>
  )
}

async function CartButtonContent() {
  const cart = await retrieveCart().catch(() => null)

  return <CartDropdown cart={cart} />
}
