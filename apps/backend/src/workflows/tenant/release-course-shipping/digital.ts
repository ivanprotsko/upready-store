/**
 * `product.metadata.digital === "true"`: the course marker the storefront and
 * the seeds already use. Kept apart from the workflow so a cart hook can read
 * it without loading core-flows.
 */
export const isDigitalProduct = (metadata: Record<string, unknown> | null | undefined): boolean =>
  metadata?.digital === "true";
