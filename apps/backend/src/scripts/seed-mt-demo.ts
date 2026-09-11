import path from "node:path";
import fs from "node:fs";
import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import TenantModuleService from "../modules/tenant/service";
import tenantProductCategoryLink from "../links/tenant-product-category";
import createTenantWorkflow from "../workflows/tenant/create-tenant";
import createTenantDomainWorkflow from "../workflows/tenant/create-tenant-domain";
import upsertTenantHomeWorkflow from "../workflows/tenant/upsert-tenant-home";
import { updateProductCategoriesWorkflow } from "@medusajs/medusa/core-flows";
import type { TenantHomeDocument } from "../api/tenants/home/validators";

/**
 * The demo the multi-tenant test deployment is FOR (Ivan, 2026-09-11): three
 * shops on one engine, each with its own catalog, its own theme and its own
 * domain.
 *
 *   npx medusa exec ./src/scripts/seed-mt-demo.js
 *
 * It assumes the three profile catalogs are already seeded — run the ordinary
 * seed once per profile first (`STORE_PROFILE=sneakers`, then `home-goods`,
 * then `electronics`); initial-data-seed.ts's own header documents that a
 * second run adds a profile instead of a second store.
 *
 * Idempotent throughout: an existing tenant, an existing domain row and an
 * existing home document are all left as they are, so re-running after a fix
 * costs nothing.
 *
 * What it does NOT do: touch DNS or the proxy. A tenant's hosts reach traefik
 * through deploy/scripts/tenant-ingress-sync.sh, which reads these same rows.
 */
const DEMO = [
  {
    handle: "acme",
    name: "Acme",
    admin: { email: "admin@acme.test", first_name: "Ada", last_name: "Acme" },
    profile: "sneakers",
    theme: "sneakers" as const,
    domains: ["custombot.space", "www.custombot.space"],
  },
  {
    handle: "globex",
    name: "Globex",
    admin: { email: "admin@globex.test", first_name: "Gus", last_name: "Globex" },
    profile: "home-goods",
    theme: "home-goods" as const,
    domains: ["setpomo.com", "www.setpomo.com"],
  },
  {
    handle: "initech",
    name: "Initech",
    admin: { email: "admin@initech.test", first_name: "Ida", last_name: "Initech" },
    profile: "electronics",
    theme: "electronics" as const,
    domains: ["shiftship.dev", "www.shiftship.dev"],
  },
];

const PROVIDER = "emailpass";

/**
 * The handles of one profile's catalog, read from the seed data that produced
 * it. Reading the file is what makes "which products are this tenant's" a fact
 * rather than a guess about sales-channel names: the same list seeded them.
 *
 * `medusa build` copies `src/migration-scripts/data` next to the compiled
 * script (scripts/copy-migration-data.js), so this path resolves in the image
 * exactly as it does from source.
 */
const profileHandles = (profile: string): string[] => {
  const file = path.join(__dirname, "..", "migration-scripts", "data", "profiles", profile, "catalog", "products.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { handle: string }[];
  const handles = parsed.map((product) => product.handle).filter(Boolean);

  if (handles.length === 0) {
    // Zero is not empty (rule 20): a silently empty catalog would hand the
    // tenant an empty shop and read as "the profile has no products".
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `seed-mt-demo: ${file} lists no product handle.`,
    );
  }

  return handles;
};

type CategoryJson = { handle?: string; children?: CategoryJson[] };

/**
 * The handles of one profile's category tree, parents AND children, read the
 * same way `profileHandles()` reads the product list: from the seed data that
 * produced it, so "which categories are this tenant's" is a fact rather than a
 * guess. Categories carry no sales channel and no profile column of their own
 * (`links/tenant-product-category.ts`'s header note) — this file is the only
 * place that says which profile a category handle belongs to.
 */
const profileCategoryHandles = (profile: string): string[] => {
  const file = path.join(__dirname, "..", "migration-scripts", "data", "profiles", profile, "catalog", "categories.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as CategoryJson[];
  const handles: string[] = [];

  const walk = (nodes: CategoryJson[]) => {
    for (const node of nodes) {
      if (node.handle) {
        handles.push(node.handle);
      }
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };

  walk(parsed);

  if (handles.length === 0) {
    // Zero is not empty (rule 20): a silently empty category tree would hand
    // the tenant a shop with nothing to browse and read as "the profile has
    // no categories".
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `seed-mt-demo: ${file} lists no category handle.`,
    );
  }

  return handles;
};

/**
 * Where `/static/store-profiles` is served from (W3, t-2026-09-12-mt-storefront-by-host):
 * `https://shipshift.dev/static/store-profiles` in production, no profile segment — this
 * script appends `/<profile>/<file>` itself, because unlike the ordinary per-profile seed
 * (`STORE_MEDIA_BASE_URL`, re-exported once per `STORE_PROFILE` run and baked into that
 * profile's own products), this script touches all three profiles' media in one run.
 */
const STORE_PROFILES_MEDIA_BASE_URL = (process.env.STORE_PROFILES_MEDIA_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

const mediaUrl = (profile: string, ref: string): string => {
  if (!STORE_PROFILES_MEDIA_BASE_URL) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `seed-mt-demo: STORE_PROFILES_MEDIA_BASE_URL is not set, so profile "${profile}" image ` +
        `"${ref}" has no URL. Set it to where /static/store-profiles is served, e.g. ` +
        `https://shipshift.dev/static/store-profiles (production) or ` +
        `http://localhost:9000/static/store-profiles (local).`,
    );
  }

  const filename = ref.startsWith("media/") ? ref.slice("media/".length) : ref;
  return `${STORE_PROFILES_MEDIA_BASE_URL}/${profile}/${filename}`;
};

type SeedProductJson = { category?: string; images?: string[]; imageDark?: string };

/** A frame and, when the profile authored one, the same frame for dark mode
 *  (`specs/store-profiles/MODE-IMAGE-PAIRS.md`). `dark` absent = no pair, and both modes
 *  show `light` — which is every profile until the abstract-set track renders the twins. */
type ModeImageRef = { light: string; dark?: string };

/**
 * One representative image per category handle, parents included — built from
 * the SAME seed data that produced the catalog, never invented (rule 17a: the
 * live `/opt/upready-store/media/<profile>/` directory is not reachable from
 * here, so this reuses a real, already-live product photo instead of guessing
 * at a filename). A leaf category takes the first product whose own
 * `category` field names it (products attach to leaf categories only,
 * `categories.ts`'s own note); a parent takes its first descendant's image,
 * since a parent itself owns no product.
 */
const profileCategoryImages = (profile: string): Map<string, ModeImageRef> => {
  const productsFile = path.join(
    __dirname, "..", "migration-scripts", "data", "profiles", profile, "catalog", "products.json",
  );
  const products = JSON.parse(fs.readFileSync(productsFile, "utf8")) as SeedProductJson[];

  const byLeafCategory = new Map<string, ModeImageRef>();
  for (const product of products) {
    if (product.category && product.images?.[0] && !byLeafCategory.has(product.category)) {
      // The pair travels with the frame it belongs to: a category that borrows a product's
      // light photograph borrows its dark twin too, or neither.
      byLeafCategory.set(product.category, {
        light: product.images[0],
        ...(product.imageDark ? { dark: product.imageDark } : {}),
      });
    }
  }

  const categoriesFile = path.join(
    __dirname, "..", "migration-scripts", "data", "profiles", profile, "catalog", "categories.json",
  );
  const tree = JSON.parse(fs.readFileSync(categoriesFile, "utf8")) as CategoryJson[];
  const images = new Map<string, ModeImageRef>();

  const walk = (node: CategoryJson): ModeImageRef | undefined => {
    if (!node.handle) {
      return undefined;
    }

    // Every child is walked regardless of what an earlier sibling returned —
    // `walk()` is what RECORDS that child's own image in `images`, so
    // short-circuiting the loop early (`??` reused as both "keep walking"
    // and "the parent's own fallback") would silently skip every child
    // after the first one that has a picture.
    let firstChildImage: ModeImageRef | undefined;
    for (const child of node.children ?? []) {
      const childImage = walk(child);
      firstChildImage = firstChildImage ?? childImage;
    }

    const image = byLeafCategory.get(node.handle) ?? firstChildImage;

    if (image) {
      images.set(node.handle, image);
    }

    return image;
  };

  for (const node of tree) {
    walk(node);
  }

  return images;
};

/**
 * The three demo shops speak English in their document; a Russian visitor gets the
 * same promise in Russian (`content.hero.i18n`, read by the storefront's home page).
 * Measured before the fix on acme/globex/initech `/ru`: English subtitle over a
 * Russian catalog (2026-09-12).
 */
const demoHeroCopy = (demo: { name: string }) => ({
  ru: {
    subtitle: `${demo.name} работает на общем движке и отвечает на своём домене.`,
    cta_label: "В каталог",
  },
});

/** The first product's own hero image, with its dark twin when the profile authored one —
 *  a stand-in for the tenant's shop hero. */
const profileHeroImage = (profile: string): ModeImageRef | undefined => {
  const file = path.join(
    __dirname, "..", "migration-scripts", "data", "profiles", profile, "catalog", "products.json",
  );
  const products = JSON.parse(fs.readFileSync(file, "utf8")) as SeedProductJson[];
  const first = products[0];
  const light = first?.images?.[0];
  if (!light) {
    return undefined;
  }
  return { light, ...(first?.imageDark ? { dark: first.imageDark } : {}) };
};

export default async function seedMtDemo({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const storeModuleService = container.resolve(Modules.STORE);
  const password = process.env.TENANT_SEED_PASSWORD || "supersecret";

  // The composition every tenant starts from: the store's own default document,
  // written by seed-storefront-settings.ts. Copying it keeps `settings` a
  // document that already passes the route's validator, instead of a second
  // hand-written transcription of its six enums.
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const defaultSettings = (store?.metadata as Record<string, unknown> | undefined)?.storefrontSettings;

  if (!defaultSettings) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "seed-mt-demo: store.metadata.storefrontSettings is missing — run the backend once so seed-storefront-settings has written it.",
    );
  }

  for (const demo of DEMO) {
    let [tenant] = await tenantModuleService.listTenants({ handle: demo.handle });

    if (!tenant) {
      const registered = await authModuleService.register(PROVIDER, {
        body: { email: demo.admin.email, password },
      });

      if (!registered.success || !registered.authIdentity) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `seed-mt-demo: could not register a login for ${demo.admin.email}: ${registered.error ?? "no reason given"}.`,
        );
      }

      const { result } = await createTenantWorkflow(container).run({
        input: {
          name: demo.name,
          handle: demo.handle,
          admin: demo.admin,
          authIdentityId: registered.authIdentity.id,
        },
      });

      tenant = result.tenant as typeof tenant;
      logger.info(`seed-mt-demo: created ${demo.handle} (${result.tenant.id}), key ${result.tenant.api_key.token}`);
    } else {
      logger.info(`seed-mt-demo: ${demo.handle} already exists (${tenant.id})`);
    }

    // The tenant's own sales channel, through the link the workflow made.
    const { data: [withChannel] } = await query.graph({
      entity: "tenant",
      fields: ["id", "handle", "sales_channel.id"],
      filters: { id: [tenant.id] },
    });
    const salesChannelId = withChannel?.sales_channel?.id as string | undefined;

    if (!salesChannelId) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `seed-mt-demo: tenant ${demo.handle} has no sales channel link.`,
      );
    }

    // Move this profile's catalog into the tenant's channel: add the link that
    // makes the products visible through the tenant's publishable key, and
    // dismiss every OTHER channel's link so the same product is not on a
    // neighbour's storefront. This IS the isolation mechanism — a product is
    // only ever fetched through the channel its key resolves to.
    const handles = profileHandles(demo.profile);
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "sales_channels.id"],
      filters: { handle: handles },
    });

    if (products.length === 0) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `seed-mt-demo: none of the ${handles.length} products of profile "${demo.profile}" is in this database — seed that profile first (STORE_PROFILE=${demo.profile}).`,
      );
    }

    let added = 0;
    let dismissed = 0;

    for (const product of products) {
      const linked = ((product.sales_channels ?? []) as { id: string }[]).map((channel) => channel.id);

      if (!linked.includes(salesChannelId)) {
        await link.create({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
        });
        added += 1;
      }

      for (const other of linked.filter((id) => id !== salesChannelId)) {
        await link.dismiss({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: other },
        });
        dismissed += 1;
      }
    }

    logger.info(
      `seed-mt-demo: ${demo.handle} — ${products.length}/${handles.length} products of "${demo.profile}", ${added} linked to its channel, ${dismissed} foreign channel link(s) dismissed`,
    );

    // Categories are global in Medusa (no sales channel, no owner column) —
    // the tenant-product-category link is the whole ownership record
    // (links/tenant-product-category.ts). Same shape as the product loop
    // above: link this profile's categories to this tenant, dismiss any
    // OTHER tenant's link on the same category (defensive — nothing should
    // create one before this script runs, but a category is only ever
    // isolated by this link, never by construction).
    const categoryHandles = profileCategoryHandles(demo.profile);
    const { data: categories } = await query.graph({
      entity: "product_category",
      fields: ["id", "handle", "name", "metadata"],
      filters: { handle: categoryHandles },
    });

    if (categories.length === 0) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `seed-mt-demo: none of the ${categoryHandles.length} categories of profile "${demo.profile}" is in this database — seed that profile first (STORE_PROFILE=${demo.profile}).`,
      );
    }

    const { data: existingCategoryLinks } = await query.graph({
      entity: tenantProductCategoryLink.entryPoint,
      fields: ["tenant_id", "product_category_id"],
      filters: { product_category_id: categories.map((category) => category.id) },
    });

    const tenantIdsByCategory = new Map<string, string[]>();
    for (const categoryLink of existingCategoryLinks) {
      const categoryId = categoryLink.product_category_id as string;
      const linked = tenantIdsByCategory.get(categoryId) ?? [];
      linked.push(categoryLink.tenant_id as string);
      tenantIdsByCategory.set(categoryId, linked);
    }

    let categoriesLinked = 0;
    let categoryLinksDismissed = 0;

    for (const category of categories) {
      const linkedTenantIds = tenantIdsByCategory.get(category.id) ?? [];

      if (!linkedTenantIds.includes(tenant.id)) {
        await link.create({
          [TENANT_MODULE]: { tenant_id: tenant.id },
          [Modules.PRODUCT]: { product_category_id: category.id },
        });
        categoriesLinked += 1;
      }

      for (const other of linkedTenantIds.filter((id) => id !== tenant.id)) {
        await link.dismiss({
          [TENANT_MODULE]: { tenant_id: other },
          [Modules.PRODUCT]: { product_category_id: category.id },
        });
        categoryLinksDismissed += 1;
      }
    }

    logger.info(
      `seed-mt-demo: ${demo.handle} — ${categories.length}/${categoryHandles.length} categories of "${demo.profile}", ${categoriesLinked} linked to the tenant, ${categoryLinksDismissed} foreign tenant link(s) dismissed`,
    );

    // Category images (W3, t-2026-09-12-mt-storefront-by-host): the decision,
    // made before this code and binding on it, is `metadata.image_url` (+
    // `metadata.image_alt`) — see the field's own doc comment in
    // `lib/data/categories.ts` and `home/edit-category-form.tsx` for why. Only
    // a category with NO image yet is touched, so a shop owner's own pick
    // through the panel survives every re-run.
    const categoryImages = profileCategoryImages(demo.profile);
    let categoriesImaged = 0;

    for (const category of categories) {
      const meta = (category.metadata ?? {}) as Record<string, unknown>;
      if (meta.image_url) {
        continue;
      }

      const ref = categoryImages.get(category.handle as string);
      if (!ref) {
        // Zero is not empty (rule 20a): every leaf category has at least one
        // product, so a category with none matched here means the mapping
        // above missed it, not that the category has nothing to show.
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `seed-mt-demo: no product image maps to category "${category.handle}" of profile ` +
            `"${demo.profile}" (checked ${path.join("migration-scripts", "data", "profiles", demo.profile, "catalog", "products.json")}).`,
        );
      }

      await updateProductCategoriesWorkflow(container).run({
        input: {
          selector: { id: category.id },
          update: {
            metadata: {
              ...meta,
              image_url: mediaUrl(demo.profile, ref.light),
              // One description per pair (`MODE-IMAGE-PAIRS.md`): the same subject, two
              // lightings. The dark key is written only when the profile has a twin, so a
              // profile without one leaves no empty key behind.
              image_alt: category.name as string,
              ...(ref.dark ? { image_url_dark: mediaUrl(demo.profile, ref.dark) } : {}),
            },
          },
        },
      });
      categoriesImaged += 1;
    }

    logger.info(
      `seed-mt-demo: ${demo.handle} — ${categoriesImaged}/${categories.length} categories given an image (the rest already had one)`,
    );

    // The theme is what makes the three shops tell themselves apart at a glance.
    const [home] = await tenantModuleService.listTenantHomeConfigs({ tenant_id: tenant.id });

    if (!home) {
      const heroRef = profileHeroImage(demo.profile);

      const document = {
        schema: "upready.tenant-home/v1",
        theme: { preset: demo.theme },
        settings: defaultSettings,
        content: {
          hero: {
            title: demo.name,
            subtitle: `${demo.name} runs on the shared engine and answers on its own domain.`,
            cta_label: "Shop",
            cta_href: "/store",
            image_url: heroRef ? mediaUrl(demo.profile, heroRef.light) : null,
            ...(heroRef?.dark
              ? { image_url_dark: mediaUrl(demo.profile, heroRef.dark) }
              : {}),
            i18n: demoHeroCopy(demo),
          },
          products: { source: "popular" },
          order: ["hero", "categories", "products"],
        },
        updatedAt: new Date().toISOString(),
      } as unknown as TenantHomeDocument;

      await upsertTenantHomeWorkflow(container).run({
        input: { tenant_id: tenant.id, config: document },
      });
      logger.info(`seed-mt-demo: ${demo.handle} — home document written, theme "${demo.theme}"`);
    } else {
      // The three demo tenants already own a home document from an earlier run,
      // written before W3 existed and therefore with `hero.image_url: null`.
      // "Left alone" would mean the hero image NEVER reaches the live shops —
      // the same class as the category images above, so it takes the same rule:
      // fill the hole, never overwrite a value somebody chose (rule 20).
      const document = home.config as unknown as TenantHomeDocument;
      const hero = (document?.content?.hero ?? null) as {
        image_url?: string | null;
        image_url_dark?: string | null;
        i18n?: Record<string, unknown>;
      } | null;
      let patched = false;

      if (hero && !hero.image_url) {
        const heroRef = profileHeroImage(demo.profile);

        if (!heroRef) {
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            `seed-mt-demo: profile "${demo.profile}" has no product image to stand in for the hero ` +
              `(checked ${path.join("migration-scripts", "data", "profiles", demo.profile, "catalog", "products.json")}).`,
          );
        }

        hero.image_url = mediaUrl(demo.profile, heroRef.light);
        if (heroRef.dark) {
          hero.image_url_dark = mediaUrl(demo.profile, heroRef.dark);
        }
        (document as unknown as { updatedAt: string }).updatedAt = new Date().toISOString();

        await upsertTenantHomeWorkflow(container).run({
          input: { tenant_id: tenant.id, config: document },
        });
        logger.info(`seed-mt-demo: ${demo.handle} — existing home document given its hero image`);
        patched = true;
      }

      // Same shape as the hero image above: the three live documents were written
      // before `content.hero.i18n` existed, and "left alone" would mean their Russian
      // visitors keep reading the English subtitle for good.
      if (hero && !hero.i18n) {
        hero.i18n = demoHeroCopy(demo);
        (document as unknown as { updatedAt: string }).updatedAt = new Date().toISOString();

        await upsertTenantHomeWorkflow(container).run({
          input: { tenant_id: tenant.id, config: document },
        });
        logger.info(`seed-mt-demo: ${demo.handle} — existing home document given its localized hero copy`);
        patched = true;
      }

      if (!patched) {
        logger.info(
          `seed-mt-demo: ${demo.handle} — home document already exists with a hero image and localized copy, left alone`,
        );
      }
    }

    for (const host of demo.domains) {
      const [existing] = await tenantModuleService.listTenantDomains({ host });

      if (existing) {
        logger.info(`seed-mt-demo: ${host} already claimed (tenant ${existing.tenant_id})`);
        continue;
      }

      await createTenantDomainWorkflow(container).run({
        input: { tenant_id: tenant.id, host },
      });
      logger.info(`seed-mt-demo: ${demo.handle} — domain ${host} attached`);
    }
  }
}
