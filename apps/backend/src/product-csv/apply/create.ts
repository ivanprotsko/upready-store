import type { MedusaContainer } from "@medusajs/framework/types";
import createTenantProductWorkflow from "../../workflows/tenant/create-tenant-product";
import createTenantProductCategoryWorkflow from "../../workflows/tenant/create-tenant-product-category";
import type { CatalogSnapshot } from "../catalog";
import { normalizeHeader } from "../columns";
import type { PlannedRow } from "../plan";
import type { RowDraft } from "../rows";

/**
 * The creates of an import: new categories, and new products grouped by handle
 * with their variants.
 *
 * `../apply.ts` runs these steps and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

/** The option every imported product gets when the file names variants. */
export const IMPORT_OPTION_TITLE = "Вариант";

/** The single option value a product with no variants of its own carries. */
export const IMPORT_DEFAULT_OPTION_VALUE = "Стандарт";

type CreateGroup = {
  handle: string;
  lead: PlannedRow;
  rows: PlannedRow[];
};

/**
 * Rows that create a product, grouped by handle: a product with three variants
 * arrives as three rows and has to be created once, with three variants, or
 * Medusa would refuse the second row's handle as a duplicate.
 */
export const groupCreates = (rows: PlannedRow[], draftByLine: Map<number, RowDraft>): CreateGroup[] => {
  const groups = new Map<string, CreateGroup>();

  for (const row of rows) {
    if (row.action !== "create") {
      continue;
    }

    const draft = draftByLine.get(row.line);
    const key = normalizeHeader(row.handle ?? draft?.title ?? `line-${row.line}`);
    const group = groups.get(key);

    if (group) {
      group.rows.push(row);
      continue;
    }

    groups.set(key, { handle: key, lead: row, rows: [row] });
  }

  return [...groups.values()];
};

export type CategoryLookup = Map<string, string>;

export const pathKey = (path: string[]): string => path.map((part) => normalizeHeader(part)).join(" / ");

/**
 * Creates the category levels the plan announced, shallowest first, so a child
 * always finds its parent. Every one goes through
 * `createTenantProductCategoryWorkflow`, which writes the tenant link in the
 * same transaction: a category with no link is invisible to the panel and
 * belongs to nobody.
 */
export const createMissingCategories = async ({
  container,
  tenantId,
  paths,
  snapshot,
}: {
  container: MedusaContainer;
  tenantId: string;
  paths: string[][];
  snapshot: CatalogSnapshot;
}): Promise<CategoryLookup> => {
  const lookup: CategoryLookup = new Map(
    snapshot.categories.map((category) => [pathKey(category.path), category.id]),
  );

  const ordered = [...paths].sort((left, right) => left.length - right.length);

  for (const path of ordered) {
    const key = pathKey(path);

    if (lookup.has(key)) {
      continue;
    }

    const parentKey = path.length > 1 ? pathKey(path.slice(0, -1)) : null;
    const parentId = parentKey ? (lookup.get(parentKey) ?? null) : null;

    const { result } = await createTenantProductCategoryWorkflow(container).run({
      input: {
        tenant_id: tenantId,
        product_category: {
          name: path[path.length - 1],
          is_active: true,
          ...(parentId ? { parent_category_id: parentId } : {}),
        },
      },
    });

    lookup.set(key, result.product_category.id);
  }

  return lookup;
};

const variantPayload = (draft: RowDraft, optionValue: string) => ({
  title: draft.variant_title ?? draft.title ?? optionValue,
  ...(draft.sku ? { sku: draft.sku } : {}),
  ...(draft.weight !== null ? { weight: draft.weight } : {}),
  ...(draft.length !== null ? { length: draft.length } : {}),
  ...(draft.width !== null ? { width: draft.width } : {}),
  ...(draft.height !== null ? { height: draft.height } : {}),
  manage_inventory: draft.stock !== null,
  prices: Object.entries(draft.prices).map(([currency_code, amount]) => ({
    currency_code,
    amount,
  })),
  options: { [IMPORT_OPTION_TITLE]: optionValue },
});

const optionValueFor = (draft: RowDraft, position: number): string =>
  draft.variant_title ?? draft.sku ?? (position === 0 ? IMPORT_DEFAULT_OPTION_VALUE : `${position + 1}`);

export const createProduct = async ({
  container,
  tenantAdminId,
  group,
  draftByLine,
  categories,
  imageUrls,
}: {
  container: MedusaContainer;
  tenantAdminId: string;
  group: CreateGroup;
  draftByLine: Map<number, RowDraft>;
  categories: CategoryLookup;
  imageUrls: string[];
}): Promise<{ id: string; handle: string }> => {
  const leadDraft = draftByLine.get(group.lead.line)!;
  const drafts = group.rows
    .map((row) => draftByLine.get(row.line))
    .filter((draft): draft is RowDraft => Boolean(draft));

  const optionValues = drafts.map((draft, position) => optionValueFor(draft, position));
  const categoryId = leadDraft.category_path
    ? (categories.get(pathKey(leadDraft.category_path)) ?? null)
    : null;

  const { result } = await createTenantProductWorkflow(container).run({
    input: {
      tenant_admin_id: tenantAdminId,
      product: {
        title: leadDraft.title!,
        // `planned_handle` rather than the raw cell: the plan already proved
        // this code is free across the whole platform (`uniqueness.ts`) and
        // generated one when the file left the column empty.
        ...(group.lead.planned_handle ? { handle: group.lead.planned_handle } : {}),
        ...(leadDraft.subtitle ? { subtitle: leadDraft.subtitle } : {}),
        ...(leadDraft.description ? { description: leadDraft.description } : {}),
        // Never `published`, whatever the file says: a bad import must not put
        // a broken card in front of a customer.
        status: "draft",
        ...(Object.keys(leadDraft.metadata).length > 0 ? { metadata: leadDraft.metadata } : {}),
        ...(categoryId ? { categories: [{ id: categoryId }] } : {}),
        ...(imageUrls.length > 0 ? { images: imageUrls.map((url) => ({ url })) } : {}),
        options: [
          {
            title: IMPORT_OPTION_TITLE,
            values: [...new Set(optionValues)],
          },
        ],
        variants: drafts.map((draft, position) => variantPayload(draft, optionValues[position])),
      } as never,
    },
  });

  return {
    id: result.product.id as string,
    handle: (result.product.handle as string) ?? group.handle,
  };
};
