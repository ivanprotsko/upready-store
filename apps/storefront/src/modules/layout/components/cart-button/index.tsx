import { retrieveCart } from "@lib/data/cart"
import HydrationSlot from "@modules/common/components/hydration-slot"
import CartTrigger from "@modules/layout/components/cart-trigger"

// Every header variant and the bottom nav put this straight into a `<div>`;
// being async, it reaches the RSC payload as a lazy row, so the slot keeps
// that lazy off the `<div>`'s own children (46df U-06, HydrationSlot).
//
// The sidebar it opens on desktop is rendered ONCE per page by `(main)/layout.tsx`
// (`cart-sidebar/host.tsx`), not here: a header draws this control twice (h7's desktop
// and compact bars) and the phone's bottom nav a third time.
export default function CartButton({
  variant,
}: {
  /** Passed through to `CartTrigger` (`"pill"` on the h7 header). */
  variant?: "icon" | "pill"
} = {}) {
  return (
    <HydrationSlot>
      <CartButtonContent variant={variant} />
    </HydrationSlot>
  )
}

async function CartButtonContent({ variant }: { variant?: "icon" | "pill" }) {
  const cart = await retrieveCart().catch(() => null)

  return <CartTrigger cart={cart} variant={variant} />
}
