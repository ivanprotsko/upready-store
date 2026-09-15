import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { REGIONS_BY_COUNTRY } from "../../shipping-tariffs/ru-regions";

/**
 * An order a courier can be handed carries a full address.
 *
 * The checkout used to collect one free-text line whenever no address suggest
 * provider was configured, and the multi-tenant host configures none, so a
 * cart reached payment with `city`, `postal_code` and `province` empty and the
 * shop owner was left with an order Russian Post and СДЭК both refuse
 * (measured live on `cherkashino.shipshift.dev`, order #5, 2026-09-15:
 * `{"address_1":"ул. Ленина, д. 1, кв. 2","city":"","province":"","postal_code":""}`).
 * `apps/storefront` now shows the structured fields and disables the payment
 * button, and this check is the half a browser cannot skip: `completeCartWorkflow`
 * is the single door every order comes through, whatever client opened the cart.
 * It is wired there by `complete-cart-validate.ts`, the one handler that hook
 * accepts.
 *
 * Two carts are deliberately out of scope:
 *
 * - a cart with no shipping method at all, which has nothing to post. Medusa's
 *   own `validateShippingStep` already refuses one that needs a method.
 * - a cart sent to a pickup point. The checkout blanks the delivery address on
 *   purpose there and writes the point onto `cart.metadata`
 *   (`modules/checkout/context/pickup-sheet-context.tsx`), so an empty address
 *   is the correct state. That is decided here from the shipping option's own
 *   fulfillment set rather than from the metadata, which a client writes.
 *
 * `province` is required only where the tariff module ships a region list for
 * the country (`REGIONS_BY_COUNTRY`, Russia today), because a delivery zone
 * restricted to regions matches on that exact string. The storefront keeps the
 * same list in `src/lib/util/shipping-address.ts`; a new country belongs in
 * both.
 */
export type PostableAddressField = "address_1" | "postal_code" | "city" | "province";

type AddressLike = {
  address_1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country_code?: string | null;
};

export type CartLike = {
  shipping_address?: AddressLike | null;
  shipping_methods?: { shipping_option_id?: string | null }[] | null;
};

export const provinceRequiredFor = (countryCode?: string | null): boolean =>
  Boolean(REGIONS_BY_COUNTRY[(countryCode ?? "").toLowerCase()]?.length);

export const missingPostableFields = (
  address?: AddressLike | null,
): PostableAddressField[] => {
  const required: PostableAddressField[] = [
    "address_1",
    "postal_code",
    "city",
    ...(provinceRequiredFor(address?.country_code)
      ? (["province"] as PostableAddressField[])
      : []),
  ];

  return required.filter((field) => !address?.[field]?.trim());
};

const allMethodsArePickup = async (
  container: MedusaContainer,
  optionIds: string[],
): Promise<boolean> => {
  if (optionIds.length === 0) {
    return false;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "service_zone.fulfillment_set.type"],
    filters: { id: optionIds },
  });

  return (
    options.length === optionIds.length &&
    options.every((option) => option.service_zone?.fulfillment_set?.type === "pickup")
  );
};

export const assertPostableShippingAddress = async (
  container: MedusaContainer,
  cart: CartLike,
): Promise<void> => {
  const optionIds = Array.from(
    new Set(
      (cart.shipping_methods ?? [])
        .map((method) => method.shipping_option_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (optionIds.length === 0) {
    return;
  }

  if (await allMethodsArePickup(container, optionIds)) {
    return;
  }

  const missing = missingPostableFields(cart.shipping_address);

  if (missing.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `The shipping address is missing ${missing.join(", ")}. A parcel cannot be posted without them.`,
    );
  }
};
