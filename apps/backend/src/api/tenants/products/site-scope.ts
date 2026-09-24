import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { GroupSite } from "../tenant-scope";

/**
 * On which of the client's sites a product is shown (t-2026-09-24-n12,
 * `docs/multitenancy/sites-one-db-many-storefronts.md` §3.2).
 *
 * There is no stored flag. The answer is the product's own
 * `product_sales_channel` rows: `"all"` when the product sits in the channel
 * of every site of the group, otherwise the sites whose channel it sits in.
 * The storefront already filters by the publishable key's channel and
 * `validate-cart-sales-channel` already refuses a variant outside the cart's
 * channel, so neither needed a line of change for a product to show up on, or
 * disappear from, a site.
 */
export const SiteScopeSchema = z.union([
  z.literal("all"),
  z.strictObject({ tenant_ids: z.array(z.string().min(1)).min(1) }),
]);

export type SiteScope = z.infer<typeof SiteScopeSchema>;

const channelsOf = (sites: GroupSite[]): string[] =>
  sites.map((site) => site.sales_channel_id).filter((id): id is string => Boolean(id));

/** The scope a product's current channels amount to, read against the group's sites. */
export const siteScopeOf = (productChannelIds: string[], sites: GroupSite[]): SiteScope => {
  const channels = new Set(productChannelIds);
  const shownOn = sites.filter((site) => site.sales_channel_id && channels.has(site.sales_channel_id));

  if (shownOn.length === channelsOf(sites).length) {
    return "all";
  }

  return { tenant_ids: shownOn.map((site) => site.tenant_id) };
};

/**
 * The full channel list a product should end up with: whatever it holds
 * outside the group, untouched, plus exactly the group channels the scope
 * names. A tenant id outside the group is refused with the same words as an
 * unknown one, so the answer never confirms another client's site.
 */
export const channelsForSiteScope = (
  scope: SiteScope,
  sites: GroupSite[],
  currentChannelIds: string[],
): string[] => {
  let wanted: GroupSite[];

  if (scope === "all") {
    wanted = sites;
  } else {
    const byId = new Map(sites.map((site) => [site.tenant_id, site]));
    const unknown = scope.tenant_ids.find((id) => !byId.has(id));

    if (unknown) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Site "${unknown}" was not found.`);
    }

    wanted = [...new Set(scope.tenant_ids)].map((id) => byId.get(id) as GroupSite);
  }

  const groupChannels = new Set(channelsOf(sites));
  const outside = currentChannelIds.filter((id) => !groupChannels.has(id));

  return [...new Set([...outside, ...channelsOf(wanted)])];
};

/** `product_id -> sales channel ids`, read straight from the product-sales-channel link. */
export const readProductChannels = async (
  req: AuthenticatedMedusaRequest,
  productIds: string[],
): Promise<Map<string, string[]>> => {
  const result = new Map<string, string[]>();

  if (productIds.length === 0) {
    return result;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "sales_channels.id"],
    filters: { id: productIds },
  });

  for (const product of products as { id: string; sales_channels?: ({ id?: string } | null)[] | null }[]) {
    result.set(
      product.id,
      (product.sales_channels ?? []).map((channel) => channel?.id).filter((id): id is string => Boolean(id)),
    );
  }

  return result;
};

/**
 * Adds `site_scope` and `owned` to each product of a response, for a tenant in
 * a group only: the panel needs both to show «везде / на выбранных сайтах» and
 * to open another site's product read-only. A shop without a group gets its
 * products back untouched, byte for byte what it got before.
 */
export const withSiteFields = async <T extends { id?: string }>(
  req: AuthenticatedMedusaRequest,
  products: T[],
  group: { group_id: string | null; sites: GroupSite[] },
  ownedIds: string[],
): Promise<(T | (T & { site_scope: SiteScope; owned: boolean }))[]> => {
  if (!group.group_id) {
    return products;
  }

  const channels = await readProductChannels(
    req,
    products.map((product) => product.id).filter((id): id is string => Boolean(id)),
  );
  const owned = new Set(ownedIds);

  return products.map((product) => ({
    ...product,
    site_scope: siteScopeOf(channels.get(product.id as string) ?? [], group.sites),
    owned: owned.has(product.id as string),
  }));
};
