import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";
import upsertTenantHomeWorkflow from "../../src/workflows/tenant/upsert-tenant-home";
import type { HomeBanner, TenantHomeDocument } from "../../src/api/tenants/home/validators";

/**
 * Seeds the two home banners of Ivan's mockup (Figma 238:17551, t-2026-09-24-n15)
 * into the tenant's home document, `content.banners` — the same field the panel's
 * «Баннеры на главной» section edits.
 *
 *   npx medusa exec ./scripts/fixtures/o27-seed-home-banners.ts
 *   DRY_RUN=1 npx medusa exec ./scripts/fixtures/o27-seed-home-banners.ts
 *
 * Pictures first: cut each source PNG into the responsive variants the
 * storefront's `srcset` picks from, into the backend's own static dir (not in
 * git, every stand makes them itself):
 *
 *   node scripts/media/make-image-variants.mjs <liver.png> static/home-banners/chistka-pecheni --name chistka-pecheni
 *   node scripts/media/make-image-variants.mjs <gut.png>   static/home-banners/chistka-limfy   --name chistka-limfy
 *
 * URLs are built from `LOCAL_FILE_BACKEND_URL` (else `BACKEND_PUBLIC_URL` +
 * `/static`), the same base the course cover uses. Idempotent: banners are
 * matched by `id`; a banner already equal to the file is left alone, the rest of
 * the document (theme, composition, hero, products, order, other banners) is
 * never touched. The tenant must already have a home document (the stand has
 * one; `seed-tenant-home.ts` writes one otherwise). The product link is
 * resolved from the tenant's own products by handle and fails loudly when the
 * handle is not the tenant's.
 *
 * The second banner links to `/ru/store` because no «Чистка лимфы» course exists
 * on the stand yet — Ivan changes the target in the panel when it does.
 */

const DATA_FILE = join(__dirname, "data/o27-home-banners-cherkashino.json");

type DataFile = {
  tenant_handle: string;
  static_dir: string;
  banners: Array<{
    id: string;
    image: {
      slug: string;
      alt: string;
      width: number;
      height: number;
      variants: Array<{ w: number; h: number }>;
    };
    kicker: string;
    label: string;
    title: string;
    button: string;
    link: { type: "product"; product_handle: string } | { type: "url"; href: string };
    sort: number;
  }>;
};

/** JSON with sorted keys: jsonb hands the stored banner back with its keys reordered,
 *  so a plain `JSON.stringify` compare would rewrite an unchanged banner every run. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );

const fileBaseUrl = (): string => {
  const local = process.env.LOCAL_FILE_BACKEND_URL;
  if (local) return local.replace(/\/+$/, "");
  const backend = process.env.BACKEND_PUBLIC_URL;
  if (backend) return `${backend.replace(/\/+$/, "")}/static`;
  throw new Error("o27-seed-home-banners: set LOCAL_FILE_BACKEND_URL or BACKEND_PUBLIC_URL");
};

export default async function seedO27HomeBanners({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const dryRun = process.env.DRY_RUN === "1";
  const data = JSON.parse(readFileSync(DATA_FILE, "utf8")) as DataFile;
  const base = fileBaseUrl();

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "products.id", "products.handle"],
    filters: { handle: data.tenant_handle },
  });
  const tenant = tenants[0];
  if (!tenant?.id) {
    throw new Error(`o27-seed-home-banners: tenant "${data.tenant_handle}" was not found`);
  }

  const [row] = await tenantModuleService.listTenantHomeConfigs({ tenant_id: tenant.id });
  if (!row) {
    throw new Error(
      `o27-seed-home-banners: tenant "${data.tenant_handle}" has no home document yet — save one in the panel or run seed-tenant-home first`,
    );
  }
  const document = row.config as unknown as TenantHomeDocument;

  const wanted: HomeBanner[] = data.banners.map((banner) => {
    const dir = `${base}/${data.static_dir}/${banner.image.slug}`;
    const largest = banner.image.variants[banner.image.variants.length - 1];
    let link: HomeBanner["link"];
    if (banner.link.type === "product") {
      const handle = banner.link.product_handle;
      const product = (tenant.products ?? []).find((p) => p?.handle === handle);
      if (!product?.id) {
        throw new Error(
          `o27-seed-home-banners: product "${handle}" is not a product of tenant "${data.tenant_handle}"`,
        );
      }
      link = { type: "product", product_id: product.id as string, handle };
    } else {
      link = { type: "url", href: banner.link.href };
    }
    return {
      id: banner.id,
      image: {
        src: `${dir}/${banner.image.slug}-${largest.w}.webp`,
        alt: banner.image.alt,
        width: largest.w,
        height: largest.h,
        srcset: banner.image.variants.map((v) => ({
          w: v.w,
          url: `${dir}/${banner.image.slug}-${v.w}.webp`,
        })),
      },
      kicker: banner.kicker,
      label: banner.label,
      title: banner.title,
      button: banner.button,
      link,
      sort: banner.sort,
    };
  });

  const existing = document.content.banners ?? [];
  const byId = new Map(existing.map((b) => [b.id, b]));
  const changed: string[] = [];
  for (const banner of wanted) {
    const current = byId.get(banner.id);
    if (stable(current) !== stable(banner)) {
      changed.push(banner.id);
      byId.set(banner.id, banner);
    }
  }
  const merged = [...byId.values()].sort((a, b) => a.sort - b.sort);

  if (!changed.length) {
    logger.info("o27-seed-home-banners: nothing to change, both banners already match the file");
    return;
  }

  logger.info(
    `o27-seed-home-banners: ${dryRun ? "would write" : "writing"} banners [${changed.join(", ")}] for tenant "${data.tenant_handle}" (${merged.length} total)`,
  );
  for (const id of changed) {
    logger.info(`  ${id}: ${JSON.stringify(byId.get(id))}`);
  }

  if (dryRun) {
    logger.info("o27-seed-home-banners: DRY_RUN=1, nothing written");
    return;
  }

  await upsertTenantHomeWorkflow(container).run({
    input: {
      tenant_id: tenant.id,
      config: {
        ...document,
        content: { ...document.content, banners: merged },
        updatedAt: new Date().toISOString(),
      },
    },
  });
  logger.info("o27-seed-home-banners: done");
}
