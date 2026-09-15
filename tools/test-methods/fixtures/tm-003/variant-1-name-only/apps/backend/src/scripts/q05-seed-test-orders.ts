// Variant of the f12 class: this one says nothing about itself. Only its name
// gives it away, and its name is enough — a `seed-test` script under a
// compiled tree is a one-off run either way, and the build compiles it.
import type { MedusaContainer } from "@medusajs/framework";

export default async function seedTestOrders({ container }: { container: MedusaContainer }) {
  const rows: { id: string[] } = { id: ["order_1"] };
  return rows;
}
