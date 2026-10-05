// A link definition needs the loaded modules, which a unit run does not have.
jest.mock("../../../../../links/tenant-product-category", () => ({
  __esModule: true,
  default: { entryPoint: "tenant_product_category" },
}));

import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { GET } from "../route";

/**
 * pass 3b N13: cherkashino.com is a site of one `tenant_group` with the shop
 * that created the catalogue. The group's products reached it through its own
 * sales channel, the categories did not: this route read the link rows of the
 * calling tenant alone, the sister site has none, so its storefront drew no
 * category menu and answered 404 on every category page its own breadcrumbs
 * led to. A shop outside any group must keep reading exactly its own rows.
 */

type TenantRow = { id: string; group_id?: string; archived?: boolean };
type LinkRow = { tenant_id: string; product_category_id: string };
type GraphArgs = { entity: string; filters: Record<string, unknown> };

const asList = (value: unknown): string[] => (Array.isArray(value) ? value : [value]) as string[];

const shape = (tenant: TenantRow) => ({
  id: tenant.id,
  group: tenant.group_id ? { id: tenant.group_id } : null,
  metadata: tenant.archived ? { archived_at: "2026-10-01T00:00:00.000Z" } : null,
});

const call = async (opts: {
  /** The tenant behind the storefront's publishable key. */
  caller: string;
  tenants: TenantRow[];
  links: LinkRow[];
  requestedId?: string | string[];
  /** A group filter that matched every grouped tenant, whatever its group. */
  looseGroupFilter?: boolean;
}) => {
  const graph = jest.fn(async ({ entity, filters }: GraphArgs) => {
    if (entity === "sales_channel") {
      return { data: [{ id: "sc_1", tenant: { id: opts.caller, handle: "shop", name: "Shop" } }] };
    }
    if (entity === "tenant" && filters.id) {
      return { data: opts.tenants.filter((tenant) => asList(filters.id).includes(tenant.id)).map(shape) };
    }
    if (entity === "tenant" && filters.group_id) {
      const groups = asList(filters.group_id);
      return {
        data: opts.tenants
          .filter((tenant) => tenant.group_id && (opts.looseGroupFilter || groups.includes(tenant.group_id)))
          .map(shape),
      };
    }
    if (entity === "tenant_product_category") {
      const tenantIds = asList(filters.tenant_id);
      return { data: opts.links.filter((link) => tenantIds.includes(link.tenant_id)) };
    }
    if (entity === "product_category") {
      const ids = asList(filters.id);
      return { data: ids.map((id) => ({ id })), metadata: { count: ids.length, skip: 0, take: 100 } };
    }
    throw new Error(`unexpected query.graph entity ${entity}`);
  });

  const req = {
    publishable_key_context: { sales_channel_ids: ["sc_1"] },
    filterableFields: opts.requestedId === undefined ? {} : { id: opts.requestedId },
    queryConfig: { fields: ["id", "handle"], pagination: { skip: 0, take: 100 } },
    locale: "en",
    scope: { resolve: () => ({ graph }) },
  } as unknown as MedusaStoreRequest;

  const json = jest.fn();
  await GET(req, { json } as unknown as MedusaResponse);

  const body = json.mock.calls[0][0] as { product_categories: { id: string }[]; count: number };
  const asked = (entity: string) => graph.mock.calls.filter(([args]) => args.entity === entity);

  return { body, ids: body.product_categories.map((category) => category.id), asked, graph };
};

const GROUP = [
  { id: "ten_owner", group_id: "tgrp_1" },
  { id: "ten_sister", group_id: "tgrp_1" },
  { id: "ten_other_group", group_id: "tgrp_2" },
  { id: "ten_alone" },
];

const LINKS = [
  { tenant_id: "ten_owner", product_category_id: "pcat_1" },
  { tenant_id: "ten_owner", product_category_id: "pcat_2" },
  { tenant_id: "ten_other_group", product_category_id: "pcat_9" },
  { tenant_id: "ten_alone", product_category_id: "pcat_8" },
];

describe("GET /store/tenant/product-categories", () => {
  it("gives a shop outside any group its own categories and nobody else's", async () => {
    const { ids, graph } = await call({ caller: "ten_alone", tenants: GROUP, links: LINKS });

    expect(ids).toEqual(["pcat_8"]);
    // One shop: the group's members are never asked for.
    expect(graph.mock.calls.some(([args]) => args.entity === "tenant" && "group_id" in args.filters)).toBe(false);
  });

  it("gives a sister site the categories the owner of its group created", async () => {
    const { ids } = await call({ caller: "ten_sister", tenants: GROUP, links: LINKS });

    expect(ids).toEqual(["pcat_1", "pcat_2"]);
  });

  it("never reaches into another group or a shop outside the group", async () => {
    const { ids } = await call({ caller: "ten_sister", tenants: GROUP, links: LINKS });

    expect(ids).not.toContain("pcat_9");
    expect(ids).not.toContain("pcat_8");
  });

  it("lists a category two sites of the group both own once", async () => {
    const { ids, body } = await call({
      caller: "ten_owner",
      tenants: GROUP,
      links: [
        ...LINKS,
        { tenant_id: "ten_sister", product_category_id: "pcat_1" },
        { tenant_id: "ten_sister", product_category_id: "pcat_3" },
      ],
    });

    expect(ids).toEqual(["pcat_1", "pcat_2", "pcat_3"]);
    expect(body.count).toBe(3);
  });

  it("takes nothing from an archived site of the group", async () => {
    const { ids } = await call({
      caller: "ten_sister",
      tenants: [
        { id: "ten_owner", group_id: "tgrp_1" },
        { id: "ten_sister", group_id: "tgrp_1" },
        { id: "ten_closed", group_id: "tgrp_1", archived: true },
      ],
      links: [
        { tenant_id: "ten_owner", product_category_id: "pcat_1" },
        { tenant_id: "ten_closed", product_category_id: "pcat_7" },
      ],
    });

    expect(ids).toEqual(["pcat_1"]);
  });

  it("drops a tenant of another group even when the group filter lets it through", async () => {
    const { ids } = await call({ caller: "ten_sister", tenants: GROUP, links: LINKS, looseGroupFilter: true });

    expect(ids).toEqual(["pcat_1", "pcat_2"]);
  });

  it("narrows the group's set by the requested id and never widens it", async () => {
    const { ids } = await call({
      caller: "ten_sister",
      tenants: GROUP,
      links: LINKS,
      requestedId: ["pcat_2", "pcat_9"],
    });

    expect(ids).toEqual(["pcat_2"]);
  });

  it("answers an empty page without reading categories when the whole group owns none", async () => {
    const { body, asked } = await call({
      caller: "ten_sister",
      tenants: GROUP,
      links: LINKS.filter((link) => link.tenant_id !== "ten_owner"),
    });

    expect(body).toEqual({ product_categories: [], count: 0, offset: 0, limit: 100 });
    expect(asked("product_category")).toHaveLength(0);
  });
});
