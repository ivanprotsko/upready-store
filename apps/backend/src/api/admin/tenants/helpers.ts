import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { TenantAdminRole } from "../../../modules/tenant/models/tenant-admin";

export type TenantSalesChannelSummary = { id: string; name: string; is_disabled: boolean } | null;
export type TenantApiKeySummary = { id: string; token: string; revoked_at: string | null } | null;

export type TenantSummary = {
  id: string;
  handle: string;
  name: string;
  metadata: Record<string, unknown> | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  sales_channel: TenantSalesChannelSummary;
  api_key: TenantApiKeySummary;
  admins_count: number;
  products_count: number;
  orders_count: number;
};

export type TenantAdminSummary = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  /** What the login may do in this shop (t-2026-10-07-11); the platform's screen shows it per login. */
  role: TenantAdminRole;
  created_at: string;
  updated_at: string;
};

export type TenantDetail = TenantSummary & { admins: TenantAdminSummary[] };

export type ArchivedFilter = "exclude" | "include" | "only";

/**
 * `metadata.archived_at ?? null` (contract §2): soft delete lives in the
 * tenant's own `metadata` JSON column, never a dedicated column, so every
 * reader of the flag goes through this one function.
 */
export const deriveArchivedAt = (metadata: Record<string, unknown> | null | undefined): string | null => {
  const value = metadata?.["archived_at"];
  return typeof value === "string" ? value : null;
};

type RawLinkRow = { id?: string | null } | null | undefined;

type RawTenantRow = {
  id: string;
  handle: string;
  name: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  sales_channel?: { id?: string; name?: string; is_disabled?: boolean } | null;
  api_key?: { id?: string; token?: string; revoked_at?: string | null } | null;
  admins?: (RawLinkRow & {
    email?: string;
    first_name?: string | null;
    last_name?: string | null;
    role?: TenantAdminRole;
    created_at?: string;
    updated_at?: string;
  })[];
  products?: RawLinkRow[];
  orders?: RawLinkRow[];
};

const TENANT_SUMMARY_FIELDS = [
  "id",
  "handle",
  "name",
  "metadata",
  "created_at",
  "updated_at",
  "sales_channel.id",
  "sales_channel.name",
  "sales_channel.is_disabled",
  "api_key.id",
  "api_key.token",
  "api_key.revoked_at",
  "admins.id",
  "admins.email",
  "products.id",
  "orders.id",
];

const TENANT_DETAIL_FIELDS = [
  "id",
  "handle",
  "name",
  "metadata",
  "created_at",
  "updated_at",
  "sales_channel.id",
  "sales_channel.name",
  "sales_channel.is_disabled",
  "api_key.id",
  "api_key.token",
  "api_key.revoked_at",
  "admins.id",
  "admins.email",
  "admins.first_name",
  "admins.last_name",
  "admins.role",
  "admins.created_at",
  "admins.updated_at",
  "products.id",
  "orders.id",
];

const countIds = (rows: RawLinkRow[] | undefined): number => (rows ?? []).filter((row) => Boolean(row?.id)).length;

/**
 * `PLATFORM_ADMIN_EMAIL` (o25-platform-admin-all-shops) is invisible to a
 * shop's own bookkeeping: it holds a real `tenant_admin` row in every shop
 * (so it can log in), but a shop owner never added it and never sees it as
 * one of their team. Every place that counts, lists or guards a tenant's
 * admins reads through this, so a shop with one real owner always shows
 * `admins_count: 1`, never 2.
 */
export const isPlatformAdminEmail = (email: string | null | undefined): boolean => {
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  return Boolean(platformEmail) && email === platformEmail;
};

const countAdmins = (rows: RawTenantRow["admins"] | undefined): number =>
  (rows ?? []).filter((row) => Boolean(row?.id) && !isPlatformAdminEmail(row?.email)).length;

const toSummary = (row: RawTenantRow): TenantSummary => ({
  id: row.id,
  handle: row.handle,
  name: row.name,
  metadata: row.metadata ?? null,
  archived_at: deriveArchivedAt(row.metadata),
  created_at: row.created_at,
  updated_at: row.updated_at,
  sales_channel: row.sales_channel?.id
    ? {
        id: row.sales_channel.id,
        name: row.sales_channel.name ?? "",
        is_disabled: Boolean(row.sales_channel.is_disabled),
      }
    : null,
  api_key: row.api_key?.id
    ? {
        id: row.api_key.id,
        token: row.api_key.token ?? "",
        revoked_at: row.api_key.revoked_at ?? null,
      }
    : null,
  admins_count: countAdmins(row.admins),
  products_count: countIds(row.products),
  orders_count: countIds(row.orders),
});

const toDetail = (row: RawTenantRow): TenantDetail => ({
  ...toSummary(row),
  // Kept in this array on purpose, unlike admins_count and the last-admin
  // guard below: staff is the only reader of GET /admin/tenants/:id (there
  // is no owner-facing admins/team list anywhere in this codebase — grepped
  // before making this call), and staff needs the platform row's id to
  // remove it from one shop, the exact operation this PR's own tests
  // exercise through this same response.
  admins: (row.admins ?? [])
    .filter((admin): admin is Required<Pick<NonNullable<typeof admin>, "id" | "email">> & typeof admin =>
      Boolean(admin?.id && admin?.email),
    )
    .map((admin) => ({
      id: admin.id as string,
      email: admin.email as string,
      first_name: admin.first_name ?? null,
      last_name: admin.last_name ?? null,
      role: admin.role as TenantAdminRole,
      created_at: admin.created_at as string,
      updated_at: admin.updated_at as string,
    })),
});

/**
 * Every tenant, resolved with the same links `GET /admin/tenants/:id` reads.
 * `q` and `archived` are applied here in memory rather than pushed into
 * `query.graph`'s filters: `metadata` is a JSON column and this repository
 * has no precedent elsewhere for a server-side JSON-path filter, and a
 * platform's tenant count is small enough that fetching them all and
 * filtering in JS is the safer choice for a night's work over guessing an
 * operator. Revisit with a real filter (and real pagination) once the tenant
 * count stops being small; recorded in `.ai/progress-w1.md`.
 */
export const listTenantSummaries = async (
  container: MedusaContainer,
  options: { q?: string; archived: ArchivedFilter },
): Promise<TenantSummary[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "tenant",
    fields: TENANT_SUMMARY_FIELDS,
  });

  let rows = (data as RawTenantRow[]).map(toSummary);

  if (options.q) {
    const needle = options.q.toLowerCase();
    rows = rows.filter(
      (row) => row.handle.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
    );
  }

  if (options.archived === "exclude") {
    rows = rows.filter((row) => row.archived_at === null);
  } else if (options.archived === "only") {
    rows = rows.filter((row) => row.archived_at !== null);
  }

  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  return rows;
};

const tenantNotFound = (id: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant with id "${id}" was not found`);

/** `GET /admin/tenants/:id` and the response of every write on `/admin/tenants/:id*`. */
export const fetchTenantDetail = async (container: MedusaContainer, id: string): Promise<TenantDetail> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "tenant",
    fields: TENANT_DETAIL_FIELDS,
    filters: { id: [id] },
  });

  const row = (data as RawTenantRow[])[0];

  if (!row) {
    throw tenantNotFound(id);
  }

  return toDetail(row);
};

export const tenantNotFoundError = tenantNotFound;
