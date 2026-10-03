import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { isDigitalProduct } from "../tenant/release-course-shipping/digital";

/**
 * An online course is sold one per cart (t-cherk-com-hotfix batch 5, Q3.5): a
 * second copy gives the buyer nothing. The storefront offers no «+» on a
 * course line; this is the half a client cannot skip. A course is a product
 * with `metadata.digital = "true"`, the marker `markProductAsCourse` writes.
 *
 * Three entries put a quantity on a line, each checked before its writes:
 * - `createCartWorkflow` (`POST /store/carts` with `items`) and
 *   `addToCartWorkflow` (`POST /store/carts/:id/line-items`, which adds to the
 *   line already holding the variant): called from their `validate` handlers
 *   in `validate-cart-sales-channel.ts`, since Medusa accepts one handler per
 *   hook;
 * - `updateLineItemInCartWorkflow` (`POST /store/carts/:id/line-items/:line_id`):
 *   wired in `update-line-item-validate.ts`.
 *
 * This file registers no hook and loads no core-flows, so the hook files and
 * their unit tests can import it as they are.
 */
export const COURSE_MAX_QUANTITY = 1;

type QuantityLine = { variant_id?: string | null; quantity?: unknown };

const courseRefused = () =>
  new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "An online course is sold one per order, and this cart already holds it or asks for more than one",
  );

const courseVariantIds = async (container: MedusaContainer, variantIds: string[]): Promise<Set<string>> => {
  if (!variantIds.length) {
    return new Set();
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "product.metadata"],
    filters: { id: variantIds },
  });
  return new Set(
    (variants as { id: string; product?: { metadata?: Record<string, unknown> | null } | null }[])
      .filter((variant) => isDigitalProduct(variant.product?.metadata))
      .map((variant) => variant.id),
  );
};

const quantityOf = (line: QuantityLine) => Number(line.quantity ?? 1);

/** New lines for a cart, `cartId` being `null` while the cart is created with them. */
export const assertCourseQuantityOnAdd = async (
  container: MedusaContainer,
  cartId: string | null,
  items: QuantityLine[] | null | undefined,
): Promise<void> => {
  const adding = (items ?? []).filter((item): item is QuantityLine & { variant_id: string } =>
    Boolean(item.variant_id),
  );
  const courses = await courseVariantIds(
    container,
    Array.from(new Set(adding.map((item) => item.variant_id))),
  );
  if (!courses.size) {
    return;
  }

  let existing: QuantityLine[] = [];
  if (cartId) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "items.variant_id", "items.quantity"],
      filters: { id: cartId },
    });
    existing = ((carts[0] as { items?: QuantityLine[] | null } | undefined)?.items ?? []) as QuantityLine[];
  }

  for (const variantId of Array.from(courses)) {
    const total = [...existing, ...adding]
      .filter((line) => line.variant_id === variantId)
      .reduce((sum, line) => sum + quantityOf(line), 0);
    if (total > COURSE_MAX_QUANTITY) {
      throw courseRefused();
    }
  }
};

/** A new quantity for a line already in the cart (`cart.items` as the update workflow reads it). */
export const assertCourseQuantityOnUpdate = async (
  container: MedusaContainer,
  cart: { items?: ({ id: string } & QuantityLine)[] | null },
  itemId: string,
  quantity: unknown,
): Promise<void> => {
  if (quantity === undefined || quantity === null || Number(quantity) <= COURSE_MAX_QUANTITY) {
    return;
  }
  const line = (cart.items ?? []).find((item) => item.id === itemId);
  if (!line?.variant_id) {
    return;
  }
  const courses = await courseVariantIds(container, [line.variant_id]);
  if (courses.size) {
    throw courseRefused();
  }
};
