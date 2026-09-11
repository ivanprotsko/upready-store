import type { MedusaContainer } from "@medusajs/framework";
import { logger } from "@medusajs/framework/logger";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  createStoresWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { SEED_LOCALES } from "../data/i18n";
import { SEED_REGIONS } from "../data/regions";
import { SEED_STORE } from "../data/store";
import { getQuery } from "./utils";

/**
 * What a seed run has to do in the database it is pointed at.
 *
 * - `full`      — an empty database: everything, the way the seed always ran.
 * - `add-profile` — a database that already carries a store: only the parts a
 *   second profile needs of its own (its sales channel, key, catalog and
 *   translations). The store, the 241 regions, the tax regions, the stock
 *   locations and the fulfillment sets are shared and are NOT seeded again.
 * - `skip`      — this profile's own sales channel is already there.
 *
 * The mode is derived from the database, not from an environment variable: the
 * sales channel name carries the brand (`data/store/index.ts`), so "my channel
 * exists" and "some store exists" are two different questions with two
 * different answers.
 */
export type SeedMode = "full" | "add-profile" | "skip";

export const getSalesChannel = async (container: MedusaContainer) => {
  const { data } = await getQuery(container).graph({
    entity: "sales_channel",
    fields: ["id"],
    filters: { name: SEED_STORE.sales_channel.name },
  });
  return data[0];
};

/** How many products hang off this profile's channel — see `resolveSeedMode`. */
export const countSalesChannelProducts = async (
  container: MedusaContainer,
  salesChannelId: string,
) => {
  // Counted from the product side and filtered here: `sales_channels` is a
  // link, not a column, and the graph's product filters do not reach across it.
  const { data } = await getQuery(container).graph({
    entity: "product",
    fields: ["id", "sales_channels.id"],
  });
  return data.filter((product) =>
    (product.sales_channels ?? []).some(
      (channel) => channel?.id === salesChannelId,
    ),
  ).length;
};

export const getApiKey = async (container: MedusaContainer) => {
  const { data } = await getQuery(container).graph({
    entity: "api_key",
    fields: ["id", "sales_channels.id"],
    filters: { title: SEED_STORE.publishable_api_key.title },
  });
  return data[0];
};

export const getStore = async (container: MedusaContainer) => {
  const { data } = await getQuery(container).graph({
    entity: "store",
    fields: ["id"],
  });
  return data[0];
};

export const resolveSeedMode = async (
  container: MedusaContainer,
): Promise<SeedMode> => {
  const salesChannel = await getSalesChannel(container);

  if (salesChannel) {
    // A channel is not a seeded profile — a channel WITH PRODUCTS is. The seed
    // is not transactional: the first multi-profile run on shipshift.dev died
    // at the product options and left home-goods with a sales channel, a key
    // and six categories but no catalog (2026-09-11). Reading "the channel is
    // there" as "this profile is done" made that state permanent, because the
    // only repair left was deleting rows by hand. Zero products is a crashed
    // run, and it is resumed loudly rather than skipped silently (rule 20a).
    const productCount = await countSalesChannelProducts(
      container,
      salesChannel.id,
    );

    if (productCount > 0) {
      logger.info(
        `Sales channel "${SEED_STORE.sales_channel.name}" already carries ${productCount} product(s) — skipping initial data seed.`,
      );
      return "skip";
    }

    logger.warn(
      `Sales channel "${SEED_STORE.sales_channel.name}" exists but carries NO product — a previous run of this profile did not finish. Resuming it: the channel, its key and any category already created are reused, not duplicated.`,
    );
    return "add-profile";
  }

  if (await getStore(container)) {
    logger.info(
      `A store already exists in this database — seeding "${SEED_STORE.name}" as an additional profile (shared regions, tax regions, stock locations and fulfillment are left alone).`,
    );
    return "add-profile";
  }

  return "full";
};

export const isAlreadySeeded = async (container: MedusaContainer) =>
  (await resolveSeedMode(container)) === "skip";

/**
 * The one part of the store data every profile needs of its own: its sales
 * channel, its publishable key, and the link between them. That link is what
 * `/store/products` filters by, so it is the whole of catalog isolation.
 */
export const seedSalesChannel = async (container: MedusaContainer) => {
  // Find-or-create at every step, so a resumed run (see `resolveSeedMode`)
  // joins the rows its crashed predecessor already committed instead of
  // minting a second "<brand> Sales Channel" and a second publishable key —
  // two keys for one profile is a storefront that shows the wrong catalog
  // depending on which one the resolver happened to pick.
  const existingChannel = await getSalesChannel(container);
  const salesChannel =
    existingChannel ??
    (
      await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [SEED_STORE.sales_channel] },
      })
    ).result[0];

  const existingKey = await getApiKey(container);
  const publishableApiKey =
    existingKey ??
    (
      await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: SEED_STORE.publishable_api_key.title,
              type: "publishable",
              created_by: "",
            },
          ],
        },
      })
    ).result[0];

  const linked = (existingKey?.sales_channels ?? []).some(
    (channel) => channel?.id === salesChannel.id,
  );

  if (!linked) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: publishableApiKey.id, add: [salesChannel.id] },
    });
  }

  return salesChannel;
};

export const seedStore = async (container: MedusaContainer) => {
  const salesChannel = await seedSalesChannel(container);

  const currencyCodes = Array.from(
    new Set(SEED_REGIONS.map((seedRegion) => seedRegion.currency_code)),
  );

  if (!currencyCodes.includes(SEED_STORE.default_currency_code)) {
    throw new Error(
      `Default currency "${SEED_STORE.default_currency_code}" has no region. Use one of: ${currencyCodes.join(", ")}.`,
    );
  }

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: SEED_STORE.name,
          supported_currencies: currencyCodes.map((currency_code) => ({
            currency_code,
            is_default: currency_code === SEED_STORE.default_currency_code,
          })),
          supported_locales: SEED_LOCALES.map((locale_code) => ({
            locale_code,
          })),
          default_sales_channel_id: salesChannel.id,
        },
      ],
    },
  });
};
