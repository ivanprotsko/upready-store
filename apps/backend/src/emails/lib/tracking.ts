/** A shipping label as the Fulfillment Module stores it. */
export type FulfillmentLabel = {
  tracking_number?: string | null;
  tracking_url?: string | null;
};

/**
 * «СДЭК 1005248796431» — the carrier the shop owner typed on the shipment
 * (`fulfillment.metadata.carrier`) in front of the tracking number.
 *
 * One function for the whole letter, because the template and the plain-text
 * fallback assembled the same string separately and drifted: the template's
 * copy named itself on the right-hand side, recursed until the stack gave out
 * and took the entire `shipment.created` handler with it, so no customer was
 * ever told their parcel had left (measured 2026-09-15 on a clone of the
 * client's database). The storefront's own copy of this rule lives in
 * `apps/storefront/src/lib/util/order-tracking.ts`.
 */
export const trackingLine = (
  label: FulfillmentLabel,
  carrier?: string | null,
): string => {
  const number = label.tracking_number?.trim() ?? "";
  const name = carrier?.trim();

  if (!number) {
    return "";
  }

  return name ? `${name} ${number}` : number;
};

/** Every label that carries a number, as display lines. */
export const trackingLines = (
  labels: FulfillmentLabel[] | null | undefined,
  carrier?: string | null,
): string[] =>
  (labels ?? []).map((label) => trackingLine(label, carrier)).filter(Boolean);
