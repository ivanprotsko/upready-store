// `shop.ts` statically imports these links for `resolveShopForOrder` and
// `lastOrderTenantId`. Their `defineLink(...)` calls run at module load time
// and need a fully booted Medusa app to resolve the linked modules, which a
// plain jest unit test never provides — stub them out rather than dragging a
// whole app bootstrap into this suite.
jest.mock("../../links/tenant-sales-channel", () => ({ __esModule: true, default: {} }));
jest.mock("../../links/tenant-order", () => ({ __esModule: true, default: { entryPoint: "tenant_order" } }));

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { STORE_NAME, STOREFRONT_URL } from "../../emails/i18n";
import { shopOrigin } from "../../tenant-notifications/storefront-origin";
import { TENANT_MODULE } from "../../modules/tenant";
import passwordResetEmailHandler from "../password-reset-email";

/**
 * The lead's security review of t-2026-10-02-shop-aware-account-emails: a
 * CUSTOMER'S reset link has to open the shop THEY belong to, resolved from
 * their own stored row — never from the request's publishable key, which any
 * shop owner controls and could point at their OWN domain for someone else's
 * reset token. The panel (tenant) branch is untouched by either task and gets
 * its own regression coverage here.
 */

type FakeTenant = {
  id: string;
  name?: string;
  handle?: string;
  domains?: Array<{ host?: string; is_primary?: boolean }>;
  locale_settings?: { default_locale?: string | null } | null;
};

type FakeCustomer = { id: string; metadata?: Record<string, unknown> | null } | null;

const buildContainer = (opts: {
  customer?: FakeCustomer;
  tenant?: FakeTenant | null;
  settings?: { email_from_name: string | null; email_reply_to: string | null } | null;
  tenantQueryError?: Error;
  lastOrderId?: string | null;
  lastOrderTenantId?: string | null;
}) => {
  const createNotifications = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const query = {
    graph: jest.fn(async ({ entity, filters }: { entity: string; filters: Record<string, unknown> }) => {
      if (entity === "customer" || entity === "tenant_admin") {
        return { data: opts.customer ? [opts.customer] : [] };
      }
      if (entity === "order") {
        return { data: opts.lastOrderId ? [{ id: opts.lastOrderId }] : [] };
      }
      if (entity === "tenant_order") {
        return { data: opts.lastOrderTenantId ? [{ tenant_id: opts.lastOrderTenantId }] : [] };
      }
      if (entity === "tenant") {
        if (opts.tenantQueryError) {
          throw opts.tenantQueryError;
        }
        // `tenantById` filters by a bare `{ id: tenantId }` string, not an array.
        return { data: opts.tenant && opts.tenant.id === filters.id ? [opts.tenant] : [] };
      }
      throw new Error(`unexpected query.graph entity ${entity}`);
    }),
  };

  const tenantModule = {
    listTenantNotificationSettings: jest.fn(async () => (opts.settings ? [opts.settings] : [])),
  };

  const container = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return logger;
      if (key === ContainerRegistrationKeys.QUERY) return query;
      if (key === Modules.NOTIFICATION) return { createNotifications };
      if (key === TENANT_MODULE) return tenantModule;
      throw new Error(`unexpected resolve(${key})`);
    },
  };

  return { container, createNotifications, logger };
};

describe("password-reset-email", () => {
  it("opens the shop recorded on the customer's OWN row — never the shop named by the request", async () => {
    const { container, createNotifications } = buildContainer({
      customer: { id: "cus_1", metadata: { tenant_id: "ten_A" } },
      tenant: {
        id: "ten_A",
        name: "Черкашино",
        handle: "cherkashino",
        domains: [],
        locale_settings: { default_locale: null },
      },
      settings: { email_from_name: null, email_reply_to: "owner@olavka.com" },
    });

    await passwordResetEmailHandler({
      event: {
        name: "auth.password_reset",
        data: {
          entity_id: "buyer@example.com",
          token: "tok_1",
          actor_type: "customer",
          // Shop B's own publishable key would have put THIS on the request
          // before the security fix. It must be ignored entirely.
          metadata: { tenant_id: "ten_B" },
        },
      },
      container: container as any,
      pluginOptions: {},
    });

    expect(createNotifications).toHaveBeenCalledTimes(1);
    const call = createNotifications.mock.calls[0][0];
    const shopUrl = shopOrigin({ handle: "cherkashino", primaryDomain: null });

    expect(call.to).toBe("buyer@example.com");
    expect(call.content.text).toContain(`${shopUrl}/reset-password?token=tok_1&email=buyer%40example.com`);
    expect(call.data.sender).toEqual({ name: "Черкашино", reply_to: "owner@olavka.com" });
  });

  it("falls back to the shop of the customer's last order when they have no stored tenant_id", async () => {
    const { container, createNotifications } = buildContainer({
      customer: { id: "cus_2", metadata: {} },
      lastOrderId: "order_1",
      lastOrderTenantId: "ten_last",
      tenant: {
        id: "ten_last",
        name: "Globex",
        handle: "globex",
        domains: [],
        locale_settings: { default_locale: null },
      },
    });

    await passwordResetEmailHandler({
      event: {
        name: "auth.password_reset",
        data: { entity_id: "buyer2@example.com", token: "tok_2", actor_type: "customer" },
      },
      container: container as any,
      pluginOptions: {},
    });

    const call = createNotifications.mock.calls[0][0];
    const shopUrl = shopOrigin({ handle: "globex", primaryDomain: null });
    expect(call.content.text).toContain(`${shopUrl}/reset-password?token=tok_2`);
    expect(call.data.sender).toEqual({ name: "Globex", reply_to: null });
  });

  it("falls back to the platform's own reset page with neither a stored tenant_id nor an order", async () => {
    const { container, createNotifications } = buildContainer({
      customer: { id: "cus_3", metadata: {} },
    });

    await passwordResetEmailHandler({
      event: {
        name: "auth.password_reset",
        data: { entity_id: "buyer3@example.com", token: "tok_3", actor_type: "customer" },
      },
      container: container as any,
      pluginOptions: {},
    });

    const call = createNotifications.mock.calls[0][0];
    expect(call.content.text).toContain(`${STOREFRONT_URL}/reset-password?token=tok_3&email=buyer3%40example.com`);
    expect(call.data.sender).toEqual({ name: STORE_NAME, reply_to: null });
  });

  it("falls back to the platform's own reset page for a customer row that cannot be found at all", async () => {
    const { container, createNotifications } = buildContainer({ customer: null });

    await passwordResetEmailHandler({
      event: {
        name: "auth.password_reset",
        data: { entity_id: "ghost@example.com", token: "tok_4", actor_type: "customer" },
      },
      container: container as any,
      pluginOptions: {},
    });

    const call = createNotifications.mock.calls[0][0];
    expect(call.content.text).toContain(`${STOREFRONT_URL}/reset-password?token=tok_4`);
    expect(call.data.sender).toEqual({ name: STORE_NAME, reply_to: null });
  });

  it("falls back to the platform's own reset page, and still mails the letter, when the tenant lookup fails", async () => {
    const { container, createNotifications, logger } = buildContainer({
      customer: { id: "cus_5", metadata: { tenant_id: "ten_broken" } },
      tenantQueryError: new Error("db exploded"),
    });

    await passwordResetEmailHandler({
      event: {
        name: "auth.password_reset",
        data: { entity_id: "buyer5@example.com", token: "tok_5", actor_type: "customer" },
      },
      container: container as any,
      pluginOptions: {},
    });

    expect(createNotifications).toHaveBeenCalledTimes(1);
    const call = createNotifications.mock.calls[0][0];
    expect(call.content.text).toContain(`${STOREFRONT_URL}/reset-password?token=tok_5`);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("leaves the panel (tenant) branch exactly as before: no shop, no sender override", async () => {
    const previousPanelUrl = process.env.PANEL_PUBLIC_URL;
    process.env.PANEL_PUBLIC_URL = "https://panel.shipshift.dev";

    try {
      const { container, createNotifications } = buildContainer({});

      await passwordResetEmailHandler({
        event: {
          name: "auth.password_reset",
          data: {
            entity_id: "owner@shop.example",
            token: "tok_6",
            actor_type: "tenant",
            metadata: { tenant_id: "ten_1" },
          },
        },
        container: container as any,
        pluginOptions: {},
      });

      expect(createNotifications).toHaveBeenCalledTimes(1);
      const call = createNotifications.mock.calls[0][0];
      expect(call.content.text).toContain("https://panel.shipshift.dev/reset-password?token=tok_6");
      expect(call.data).toBeUndefined();
    } finally {
      if (previousPanelUrl === undefined) {
        delete process.env.PANEL_PUBLIC_URL;
      } else {
        process.env.PANEL_PUBLIC_URL = previousPanelUrl;
      }
    }
  });
});
