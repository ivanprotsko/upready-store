/**
 * o25-hide-test-shops: `metadata.test_shop === true` marks a tenant as a
 * dev/test fixture (acme, globex, w7-shot-*, p9-* and the like) rather than a
 * real shop, the same way `metadata.archived_at` marks a soft-deleted one
 * (`api/admin/tenants/helpers.ts`). No dedicated column, no hard-coded handle
 * list anywhere product code reads: every creator of a dev/test tenant sets
 * this, and every reader of the shop switcher's list checks it here.
 */
export const TEST_SHOP_METADATA_KEY = "test_shop";

export const isTestShop = (metadata: unknown): boolean =>
  Boolean(
    metadata &&
      typeof metadata === "object" &&
      (metadata as Record<string, unknown>)[TEST_SHOP_METADATA_KEY] === true,
  );

/** `{ ...metadata, test_shop: true }`, never unset once true — see callers. */
export const markTestShopMetadata = (
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> => ({
  ...(metadata ?? {}),
  [TEST_SHOP_METADATA_KEY]: true,
});
