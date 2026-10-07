import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { getTenantAdminAccess, guardTenantAdmin } from "../tenant-admin-gate";

/**
 * `guardTenantAdmin` with the database replaced by one answer
 * (t-2026-10-07-11). What is held here is the order of its three questions
 * and that all three are answered from ONE read of the login row: the archive
 * gate used to make that read alone, and the role must not cost a second one.
 */

type LoginRow = {
  id: string;
  email: string;
  role: unknown;
  tenant: { id: string; metadata: Record<string, unknown> | null } | null;
};

const loginRow = (overrides: Partial<LoginRow> = {}): LoginRow => ({
  id: "tenadm_1",
  email: "worker@gate.test",
  role: "operator",
  tenant: { id: "ten_1", metadata: null },
  ...overrides,
});

const run = async (
  found: LoginRow | null,
  request: { method?: string; originalUrl?: string; actorId?: string | null } = {},
) => {
  const graph = jest.fn(async () => ({ data: found ? [found] : [] }));
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const next = jest.fn();

  const req = {
    method: request.method ?? "GET",
    originalUrl: request.originalUrl ?? "/tenants/orders",
    auth_context: request.actorId === null ? undefined : { actor_id: request.actorId ?? "tenadm_1" },
    scope: {
      resolve: (key: string) => {
        expect(key).toBe(ContainerRegistrationKeys.QUERY);
        return { graph };
      },
    },
  } as unknown as MedusaRequest;

  await guardTenantAdmin(req, { status } as unknown as MedusaResponse, next);

  return { req, graph, status, json, next };
};

describe("guardTenantAdmin", () => {
  it("reads the caller's row once, by the id in the token, with the role and the shop's archive mark", async () => {
    const { graph, next } = await run(loginRow());

    expect(graph).toHaveBeenCalledTimes(1);
    expect(graph).toHaveBeenCalledWith({
      entity: "tenant_admin",
      fields: ["id", "email", "role", "tenant.id", "tenant.metadata"],
      filters: { id: ["tenadm_1"] },
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("lets a request through and leaves what it read on the request", async () => {
    const { req, status, next } = await run(loginRow({ role: "manager" }), { originalUrl: "/tenants/pages" });

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(getTenantAdminAccess(req)).toEqual({
      id: "tenadm_1",
      email: "worker@gate.test",
      tenant_id: "ten_1",
      role: "manager",
      permissions: ["orders", "customers", "reviews", "catalog", "storefront", "marketing", "marketplaces"],
    });
  });

  it("answers 401 when the row behind the token is gone, whatever the route", async () => {
    for (const originalUrl of ["/tenants/me", "/tenants/orders", "/tenants/staff", "/tenants/nobody-decided-yet"]) {
      const { status, json, next, graph } = await run(null, { originalUrl });

      expect(graph).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("answers 401 for a row whose shop is gone", async () => {
    const { status, next } = await run(loginRow({ tenant: null }));

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 with no actor on the request, without reading anything", async () => {
    const { status, next, graph } = await run(loginRow(), { actorId: null });

    expect(graph).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 for an archived shop, an owner's route included, with the archive's own message", async () => {
    const archived = loginRow({
      role: "owner",
      tenant: { id: "ten_1", metadata: { archived_at: "2026-10-01T00:00:00.000Z" } },
    });
    const { status, json, next } = await run(archived, { originalUrl: "/tenants/me" });

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ message: "Tenant is archived" });
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 403 with the permission the role lacks", async () => {
    const { status, json, next, req } = await run(loginRow({ role: "operator" }), {
      method: "GET",
      originalUrl: "/tenants/payment-settings?fields=id",
    });

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      type: "not_allowed",
      message: 'Your role in this shop does not include the "settings" permission.',
      permission: "settings",
    });
    expect(next).not.toHaveBeenCalled();
    expect(() => getTenantAdminAccess(req)).toThrow(/gate did not run/);
  });

  it("answers 403 with no permission named on a route nobody decided about, unless the caller is an owner", async () => {
    const asManager = await run(loginRow({ role: "manager" }), { originalUrl: "/tenants/nobody-decided-yet" });
    expect(asManager.status).toHaveBeenCalledWith(403);
    expect(asManager.json).toHaveBeenCalledWith({
      type: "not_allowed",
      message: "Only an owner of this shop can do this.",
      permission: null,
    });

    const asOwner = await run(loginRow({ role: "owner" }), { originalUrl: "/tenants/nobody-decided-yet" });
    expect(asOwner.next).toHaveBeenCalledTimes(1);
  });

  it("tells a read from a write by the request's method", async () => {
    const read = await run(loginRow({ role: "operator" }), { method: "GET", originalUrl: "/tenants/products" });
    expect(read.next).toHaveBeenCalledTimes(1);

    const write = await run(loginRow({ role: "operator" }), { method: "POST", originalUrl: "/tenants/products" });
    expect(write.status).toHaveBeenCalledWith(403);
    expect(write.json).toHaveBeenCalledWith(expect.objectContaining({ permission: "catalog" }));
  });

  it("gives a role it does not know the narrowest one, not the widest", async () => {
    const { req, next } = await run(loginRow({ role: "root" }), { originalUrl: "/tenants/orders" });

    expect(next).toHaveBeenCalledTimes(1);
    expect(getTenantAdminAccess(req).role).toBe("operator");

    const closed = await run(loginRow({ role: null }), { originalUrl: "/tenants/staff" });
    expect(closed.status).toHaveBeenCalledWith(403);
  });
});
