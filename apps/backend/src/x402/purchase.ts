import { createHash } from "node:crypto";

/**
 * The pure parts of the agent purchase route, `POST /store/x402/purchase`
 * (t-2026-10-03-33), apart from the workflows it drives so they are unit
 * tested on their own.
 */

export type PurchaseRequest = {
  items: Array<{ variant_id: string; quantity: number }>;
  email: string;
  shipping_address?: Record<string, unknown>;
  shipping_option_id?: string;
  country_code?: string;
};

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
};

/**
 * Names one purchase request of one shop, so the request with payment finds
 * the cart its unpaid twin was quoted on instead of opening a second one: the
 * agent signs the total of THAT cart. Items are summed per variant and sorted,
 * so their order and splitting do not matter; everything else counts as sent.
 */
export const purchaseQuoteKey = (tenantId: string, request: PurchaseRequest): string => {
  const quantities = new Map<string, number>();
  for (const item of request.items) {
    quantities.set(item.variant_id, (quantities.get(item.variant_id) ?? 0) + item.quantity);
  }
  const items = [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b));
  const body = canonical({
    tenant: tenantId,
    items,
    email: request.email.toLowerCase(),
    shipping_address: request.shipping_address ?? null,
    shipping_option_id: request.shipping_option_id ?? null,
    country_code: request.country_code ?? null,
  });
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
};

export type ShippingOptionChoice = {
  id: string;
  name?: string | null;
  amount?: number | null;
  price_type?: string | null;
  metadata?: Record<string, unknown> | null;
  insufficient_inventory?: boolean | null;
};

export type ShippingPick =
  | { option: ShippingOptionChoice; error?: undefined }
  | { option?: undefined; error: "shipping_option_not_available" | "no_shipping_option" };

const isDigitalDelivery = (option: ShippingOptionChoice): boolean => {
  const flag = option.metadata?.digital_delivery;
  return flag === true || flag === "true";
};

const priced = (option: ShippingOptionChoice): boolean =>
  typeof option.amount === "number" && Number.isFinite(option.amount) && option.insufficient_inventory !== true;

/**
 * The shipping option an agent's cart gets.
 *
 * - The one the agent named, if the cart may use it.
 * - A parcel to post: the cheapest priced option that is not the shop's
 *   «digital delivery», so a course's ₽0 method never carries a T-shirt.
 * - Nothing to post, but a line Medusa still holds as shippable (a course
 *   whose product keeps a shipping profile): the digital delivery option,
 *   else the cheapest priced one, because Medusa refuses the order without a
 *   method for that line.
 */
export const pickShippingOption = (
  options: readonly ShippingOptionChoice[],
  input: { requested?: string; needsShipping: boolean },
): ShippingPick => {
  if (input.requested) {
    const named = options.find((option) => option.id === input.requested);
    return named && priced(named) ? { option: named } : { error: "shipping_option_not_available" };
  }
  const cheapest = (candidates: ShippingOptionChoice[]) =>
    candidates.filter(priced).sort((a, b) => (a.amount as number) - (b.amount as number))[0];

  if (input.needsShipping) {
    const option = cheapest(options.filter((candidate) => !isDigitalDelivery(candidate)));
    return option ? { option } : { error: "no_shipping_option" };
  }
  const option = cheapest(options.filter(isDigitalDelivery)) ?? cheapest([...options]);
  return option ? { option } : { error: "no_shipping_option" };
};

/**
 * One operation at a time per key inside this process: two requests with the
 * same signed payment, or for the same quoted cart, must not open payment
 * sessions on one cart at once (opening one deletes the other). The backend
 * runs as one process; a second one would need a database lock instead.
 */
export const createKeyedMutex = () => {
  const tails = new Map<string, Promise<void>>();
  return async <T>(keys: readonly string[], work: () => Promise<T>): Promise<T> => {
    const unique = [...new Set(keys)].sort();
    const previous = unique.map((key) => tails.get(key) ?? Promise.resolve());
    let release!: () => void;
    const done = new Promise<void>((resolve) => (release = resolve));
    for (const key of unique) {
      tails.set(key, done);
    }
    await Promise.all(previous.map((tail) => tail.catch(() => undefined)));
    try {
      return await work();
    } finally {
      release();
      for (const key of unique) {
        if (tails.get(key) === done) {
          tails.delete(key);
        }
      }
    }
  };
};
