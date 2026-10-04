import type { MedusaContainer } from "@medusajs/framework";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import {
  addToCartWorkflow,
  createCartWorkflow,
  createCustomerAccountWorkflow,
  deleteLineItemsWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows";

import { authIdentityEntityId, syntheticEmailFor } from "../modules/auth-telegram/lib/identity";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import type { TenantIntegrationProvider } from "../modules/tenant/models/tenant-integration-secret";
import { WISHLIST_MODULE } from "../modules/wishlist";
import type WishlistModuleService from "../modules/wishlist/service";
import { writeTenantSecretSlot } from "../tenant-secrets/slot";
import { readUsableTelegramBot } from "../tenant-secrets/telegram";
import type {
  ShopCart,
  ShopCartLine,
  ShopCategory,
  ShopOrderSummary,
  ShopPage,
  ShopPort,
  ShopPrice,
  ShopProduct,
  ShopProductSummary,
  ShopVariant,
  TgUser,
} from "./types";

/**
 * `ShopPort` over one shop's own Medusa data (t-cherk-23, phase 1): the same
 * carts, customers and orders the storefront shows, read through
 * `container.resolve(QUERY).graph` and written through core-flows workflows,
 * never a module service directly — the workflows are the ones that keep a
 * cart's totals, an order's links and an auth identity's `app_metadata` in
 * the state the rest of the platform expects.
 *
 * See `./types.ts` for the contract this implements and why: one Telegram
 * buyer maps onto exactly the customer the site's own first Telegram sign-in
 * would have created for them (`modules/auth-telegram/lib/identity.ts`), and
 * that customer's cart in THIS shop's sales channel is the one the storefront
 * itself would keep adding to.
 */

export type MedusaShopTenant = {
  id: string;
  salesChannelId: string;
  /**
   * `tenant_locale_settings.default_country` (two-letter, lower-case), or
   * `null`. Picks the region/currency a cart opens in, the same way the
   * storefront's own `getRegion` falls back to the shop's country before
   * falling back to `"ru"` (`apps/storefront/src/lib/data/regions.ts`).
   */
  defaultCountry: string | null;
};

type RawCategory = { id?: string | null; name?: string | null };
type RawPrice = { amount?: number | null; currency_code?: string | null };
type RawVariant = {
  id?: string | null;
  title?: string | null;
  prices?: RawPrice[] | null;
};
type RawProduct = {
  id?: string;
  title?: string;
  handle?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  categories?: RawCategory[] | null;
  variants?: RawVariant[] | null;
};
type RawCartLineItem = {
  id?: string;
  title?: string;
  variant_title?: string | null;
  quantity?: number;
  unit_price?: number;
};
type RawCart = {
  id?: string;
  currency_code?: string;
  completed_at?: string | Date | null;
  total?: number | null;
  items?: RawCartLineItem[] | null;
};
type RawOrder = {
  id?: string;
  display_id?: number;
  status?: string;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  total?: number | null;
  currency_code?: string;
  created_at?: string | Date;
};
type RawRegion = {
  id?: string;
  currency_code?: string;
  countries?: Array<{ iso_2?: string | null } | null> | null;
};

const CART_FIELDS = [
  "id",
  "currency_code",
  "completed_at",
  "total",
  "items.id",
  "items.title",
  "items.variant_title",
  "items.quantity",
  "items.unit_price",
];

/** The cheapest amount across every price tagged with this currency, or null when none is. */
const cheapestPrice = (
  prices: RawPrice[] | null | undefined,
  currencyCode: string,
): ShopPrice | null => {
  const amounts = (prices ?? [])
    .filter((price) => price.currency_code === currencyCode && typeof price.amount === "number")
    .map((price) => price.amount as number);
  return amounts.length ? { amount: Math.min(...amounts), currency_code: currencyCode } : null;
};

const toShopVariant = (variant: RawVariant, currencyCode: string): ShopVariant => ({
  id: variant.id ?? "",
  title: variant.title ?? "",
  price: cheapestPrice(variant.prices, currencyCode),
});

const toShopProductSummary = (product: RawProduct, currencyCode: string): ShopProductSummary => ({
  id: product.id ?? "",
  title: product.title ?? "",
  handle: product.handle ?? "",
  thumbnail: product.thumbnail ?? null,
  price: cheapestPrice(
    (product.variants ?? []).flatMap((variant) => variant.prices ?? []),
    currencyCode,
  ),
});

const toShopCartLine = (item: RawCartLineItem): ShopCartLine => ({
  id: item.id ?? "",
  title: item.title ?? "",
  variant_title: item.variant_title ?? null,
  quantity: item.quantity ?? 0,
  unit_price: item.unit_price ?? 0,
});

const toShopCart = (cart: RawCart): ShopCart => ({
  id: cart.id ?? "",
  currency_code: cart.currency_code ?? "",
  lines: (cart.items ?? []).map(toShopCartLine),
  total: cart.total ?? 0,
});

const telegramUserMetadata = (user: TgUser) => ({
  telegram_id: user.id,
  telegram_username: user.username ?? null,
  telegram_first_name: user.first_name ?? null,
  telegram_last_name: user.last_name ?? null,
  telegram_photo_url: null,
});

export function createMedusaShop(container: MedusaContainer, tenant: MedusaShopTenant): ShopPort {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const authModule = container.resolve(Modules.AUTH);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const wishlistModule = container.resolve<WishlistModuleService>(WISHLIST_MODULE);

  let regionPromise: Promise<{ id: string; currency_code: string }> | null = null;

  /**
   * The region a new cart opens in: the shop's own `default_country` if it
   * has one and a region covers it, else the region covering `"ru"`, else
   * whatever region exists — the exact fallback order the storefront's own
   * `getRegion` uses (`apps/storefront/src/lib/data/regions.ts`), so a cart
   * the bot opens prices the same way a browser tab on the same shop would.
   * Regions are platform-wide, not per-tenant, so this is cached once.
   */
  const resolveRegion = async (): Promise<{ id: string; currency_code: string }> => {
    if (!regionPromise) {
      regionPromise = (async () => {
        const { data: regions } = await query.graph({
          entity: "region",
          fields: ["id", "currency_code", "countries.iso_2"],
        });
        const byCountry = (countryCode: string) =>
          (regions as RawRegion[]).find((region) =>
            (region.countries ?? []).some((country) => country?.iso_2 === countryCode),
          );
        const region =
          (tenant.defaultCountry && byCountry(tenant.defaultCountry)) ||
          byCountry("ru") ||
          (regions[0] as RawRegion | undefined);
        if (!region?.id || !region.currency_code) {
          throw new MedusaError(
            MedusaError.Types.NOT_FOUND,
            "No region is configured on this platform; the shop bot cannot open a cart.",
          );
        }
        return { id: region.id, currency_code: region.currency_code };
      })();
    }
    return regionPromise;
  };

  /**
   * `telegram:<id>` → the shop customer, creating both the auth identity and
   * the customer on a buyer's first message — exactly the site's own first
   * Telegram sign-in (`modules/auth-telegram/services/telegram.ts`
   * `authenticate()` creates the identity; `createCustomerAccountWorkflow`,
   * the same workflow `POST /store/customers` runs, creates the customer and
   * sets the identity's `app_metadata.customer_id`). This is what makes the
   * bot and the site share one customer, and so one cart.
   */
  const resolveCustomerId = async (user: TgUser): Promise<string> => {
    const entityId = authIdentityEntityId(user.id);
    const [existing] = await authModule.listAuthIdentities({
      provider_identities: { entity_id: entityId, provider: "telegram" },
    });

    const identity =
      existing ??
      (await authModule.createAuthIdentities({
        provider_identities: [
          { provider: "telegram", entity_id: entityId, user_metadata: telegramUserMetadata(user) },
        ],
      }));

    const linkedCustomerId = (identity.app_metadata as Record<string, unknown> | undefined)
      ?.customer_id;
    if (typeof linkedCustomerId === "string" && linkedCustomerId) {
      return linkedCustomerId;
    }

    const { result: customer } = await createCustomerAccountWorkflow(container).run({
      input: {
        authIdentityId: identity.id,
        customerData: {
          email: syntheticEmailFor(user.id),
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          // The same place `inject-tenant-metadata.ts` puts it for a buyer
          // who signs up through the storefront.
          metadata: { tenant_id: tenant.id },
        },
      },
    });

    return customer.id;
  };

  /** This customer's newest cart in THIS shop's channel that is not completed, or null. */
  const findOpenCart = async (customerId: string): Promise<RawCart | null> => {
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: CART_FIELDS,
      filters: { customer_id: customerId, sales_channel_id: tenant.salesChannelId },
      pagination: { take: 10, order: { created_at: "DESC" } },
    } as never);
    return (carts as RawCart[]).find((cart) => !cart.completed_at) ?? null;
  };

  /** The shared cart: the customer's open cart in this channel, or a freshly created one. */
  const ensureCart = async (user: TgUser): Promise<{ id: string; raw: RawCart }> => {
    const customerId = await resolveCustomerId(user);
    const existing = await findOpenCart(customerId);
    if (existing?.id) {
      return { id: existing.id, raw: existing };
    }

    const region = await resolveRegion();
    const { result: created } = await createCartWorkflow(container).run({
      input: {
        region_id: region.id,
        currency_code: region.currency_code,
        sales_channel_id: tenant.salesChannelId,
        customer_id: customerId,
        email: syntheticEmailFor(user.id),
      },
    });

    return { id: created.id, raw: created as unknown as RawCart };
  };

  const reloadCart = async (cartId: string): Promise<ShopCart> => {
    const {
      data: [cart],
    } = await query.graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } });
    return toShopCart((cart as RawCart) ?? {});
  };

  /**
   * The ids of this shop's products, read off the product–sales-channel link.
   * A product cannot be filtered by `sales_channel_id` directly (the product
   * module has no such field, and `medusa build` rejects it), so the channel
   * becomes an id filter first — what Medusa's own `maybeApplyLinkFilter`
   * does behind `/store/products` (and `/tenants/products` in
   * `../api/middlewares.ts`). `productIds` narrows the check to those ids.
   */
  const channelProductIds = async (productIds?: string[]): Promise<string[]> => {
    const { data: links } = await query.graph({
      entity: "product_sales_channel",
      fields: ["product_id"],
      filters: {
        sales_channel_id: [tenant.salesChannelId],
        ...(productIds ? { product_id: productIds } : {}),
      },
      pagination: { take: null },
    } as never);
    return (links as Array<{ product_id?: string | null }>)
      .map((link) => link.product_id)
      .filter((id): id is string => Boolean(id));
  };

  const listCategories = async (): Promise<ShopCategory[]> => {
    const ids = await channelProductIds();
    if (ids.length === 0) {
      return [];
    }
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "categories.id", "categories.name"],
      filters: { id: ids, status: "published" },
      pagination: { take: null } as never,
    });

    const byId = new Map<string, ShopCategory>();
    for (const product of products as RawProduct[]) {
      for (const category of product.categories ?? []) {
        if (category?.id && !byId.has(category.id)) {
          byId.set(category.id, { id: category.id, name: category.name ?? "" });
        }
      }
    }
    return [...byId.values()];
  };

  const listProducts: ShopPort["listProducts"] = async ({ categoryId, offset, limit }) => {
    const ids = await channelProductIds();
    if (ids.length === 0) {
      return { items: [], total: 0 };
    }
    const region = await resolveRegion();
    // `categories: { id }` is the filter Medusa's own `/store/products` applies
    // for `category_id`; the generated `RemoteQueryFilters<"product">` types it
    // as `undefined`, so `medusa build` needs the cast.
    const { data: products, metadata } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "thumbnail", "variants.prices.amount", "variants.prices.currency_code"],
      filters: {
        id: ids,
        status: "published",
        ...(categoryId ? { categories: { id: categoryId } } : {}),
      },
      pagination: { skip: offset, take: limit },
    } as never);

    return {
      items: (products as RawProduct[]).map((product) => toShopProductSummary(product, region.currency_code)),
      total: metadata?.count ?? (products as RawProduct[]).length,
    };
  };

  const searchProducts = async (search: string, limit: number): Promise<ShopProductSummary[]> => {
    const ids = await channelProductIds();
    if (ids.length === 0) {
      return [];
    }
    const region = await resolveRegion();
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "thumbnail", "variants.prices.amount", "variants.prices.currency_code"],
      filters: {
        id: ids,
        status: "published",
        title: { $ilike: `%${search}%` },
      },
      pagination: { take: limit },
    } as never);
    return (products as RawProduct[]).map((product) => toShopProductSummary(product, region.currency_code));
  };

  const getProduct = async (productId: string): Promise<ShopProduct | null> => {
    if ((await channelProductIds([productId])).length === 0) {
      return null;
    }
    const region = await resolveRegion();
    const {
      data: [product],
    } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "thumbnail",
        "description",
        "variants.id",
        "variants.title",
        "variants.prices.amount",
        "variants.prices.currency_code",
      ],
      filters: { id: productId, status: "published" },
    });

    const raw = product as RawProduct | undefined;
    if (!raw?.id) {
      return null;
    }

    return {
      ...toShopProductSummary(raw, region.currency_code),
      description: raw.description ?? null,
      variants: (raw.variants ?? []).map((variant) => toShopVariant(variant, region.currency_code)),
    };
  };

  const getCart = async (user: TgUser): Promise<ShopCart | null> => {
    const customerId = await resolveCustomerId(user);
    const open = await findOpenCart(customerId);
    return open ? toShopCart(open) : null;
  };

  const addToCart: ShopPort["addToCart"] = async (user, variantId, quantity) => {
    const cart = await ensureCart(user);
    await addToCartWorkflow(container).run({
      input: { cart_id: cart.id, items: [{ variant_id: variantId, quantity }] },
    });
    return reloadCart(cart.id);
  };

  const setLineQuantity: ShopPort["setLineQuantity"] = async (user, lineId, quantity) => {
    const cart = await ensureCart(user);
    await updateLineItemInCartWorkflow(container).run({
      input: { cart_id: cart.id, item_id: lineId, update: { quantity } },
    });
    return reloadCart(cart.id);
  };

  const removeLine: ShopPort["removeLine"] = async (user, lineId) => {
    const cart = await ensureCart(user);
    await deleteLineItemsWorkflow(container).run({
      input: { cart_id: cart.id, ids: [lineId] },
    });
    return reloadCart(cart.id);
  };

  const addToWishlist: ShopPort["addToWishlist"] = async (user, productId) => {
    const customerId = await resolveCustomerId(user);
    const existing = await wishlistModule.listWishlistItems({
      tenant_id: tenant.id,
      customer_id: customerId,
      product_id: productId,
    });
    if (!existing.length) {
      await wishlistModule.createWishlistItems({
        tenant_id: tenant.id,
        customer_id: customerId,
        product_id: productId,
      });
    }
  };

  const listOrders: ShopPort["listOrders"] = async (user, limit) => {
    const customerId = await resolveCustomerId(user);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
        "payment_status",
        "fulfillment_status",
        "total",
        "currency_code",
        "created_at",
      ],
      filters: { customer_id: customerId, sales_channel_id: tenant.salesChannelId },
      pagination: { take: limit, order: { created_at: "DESC" } },
    } as never);

    return (orders as RawOrder[]).map((order): ShopOrderSummary => ({
      id: order.id ?? "",
      display_id: order.display_id ?? 0,
      status: order.status ?? "",
      payment_status: order.payment_status ?? null,
      fulfillment_status: order.fulfillment_status ?? null,
      total: order.total ?? 0,
      currency_code: order.currency_code ?? "",
      created_at:
        order.created_at instanceof Date ? order.created_at.toISOString() : order.created_at ?? "",
    }));
  };

  const setManagerChat = async (chatId: number): Promise<void> => {
    const bot = await readUsableTelegramBot(pg, tenant.id);
    if (!bot) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "This shop has no Telegram bot configured.",
      );
    }
    await writeTenantSecretSlot(pg, tenantModule, {
      tenantId: tenant.id,
      provider: "telegram" as TenantIntegrationProvider,
      credentials: { ...bot.credentials, manager_chat_id: chatId },
    });
  };

  /**
   * Closed mode (`access-gate.ts`). The "typed the password" fact lives on the
   * Telegram auth identity's `app_metadata.shop_bot_access[<tenant id>]`: the
   * identity is global per Telegram user while a password is per shop, so the
   * key is the tenant id. No new table, no migration, and the record survives
   * a backend restart. A user who never typed anything has no identity yet
   * and reads as "no access" without one being created for them.
   */
  const ACCESS_KEY = "shop_bot_access";

  const findTelegramIdentity = async (user: TgUser) => {
    const [existing] = await authModule.listAuthIdentities({
      provider_identities: { entity_id: authIdentityEntityId(user.id), provider: "telegram" },
    });
    return existing ?? null;
  };

  const accessMap = (appMetadata: Record<string, unknown> | undefined): Record<string, unknown> => {
    const raw = appMetadata?.[ACCESS_KEY];
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  };

  const hasBotAccess = async (user: TgUser): Promise<boolean> => {
    const identity = await findTelegramIdentity(user);
    const granted = accessMap(identity?.app_metadata as Record<string, unknown> | undefined)[tenant.id];
    return typeof granted === "string" && granted.length > 0;
  };

  const grantBotAccess = async (user: TgUser): Promise<void> => {
    const identity =
      (await findTelegramIdentity(user)) ??
      (await authModule.createAuthIdentities({
        provider_identities: [
          {
            provider: "telegram",
            entity_id: authIdentityEntityId(user.id),
            user_metadata: telegramUserMetadata(user),
          },
        ],
      }));
    const appMetadata = (identity.app_metadata ?? {}) as Record<string, unknown>;
    await authModule.updateAuthIdentities({
      id: identity.id,
      app_metadata: {
        ...appMetadata,
        [ACCESS_KEY]: { ...accessMap(appMetadata), [tenant.id]: new Date().toISOString() },
      },
    });
  };

  return {
    listCategories,
    listProducts,
    searchProducts,
    getProduct,
    getCart,
    addToCart,
    setLineQuantity,
    removeLine,
    addToWishlist,
    listOrders,
    setManagerChat,
    hasBotAccess,
    grantBotAccess,
  };
}
