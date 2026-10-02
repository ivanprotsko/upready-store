// `shop.ts` statically imports this link for `resolveShopForOrder`, which
// nothing here calls. Its `defineLink(...)` runs at module load time and
// needs a fully booted Medusa app to resolve `SalesChannelModule.linkable`,
// which a plain jest unit test never provides — stub it out rather than
// dragging a whole app bootstrap into this suite.
jest.mock("../../links/tenant-sales-channel", () => ({ __esModule: true, default: {} }));

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { STORE_NAME, STOREFRONT_URL } from "../../emails/i18n";
import { shopOrigin } from "../../tenant-notifications/storefront-origin";
import { TENANT_MODULE } from "../../modules/tenant";
import customerCreatedHandler from "../customer-created";

/**
 * t-2026-10-02-shop-aware-account-emails: the welcome letter has to speak for
 * the SHOP a customer signed up in, not for the platform, and must never
 * crash or skip the letter when there is no shop to speak for.
 */

type FakeCustomer = {
  id: string;
  email: string | null;
  first_name?: string | null;
  has_account: boolean;
  metadata?: Record<string, unknown> | null;
};

type FakeTenant = {
  id: string;
  name?: string;
  handle?: string;
  domains?: Array<{ host?: string; is_primary?: boolean }>;
  locale_settings?: { default_locale?: string | null } | null;
};

const buildContainer = (opts: {
  customers: FakeCustomer[];
  tenant?: FakeTenant | null;
  settings?: { email_from_name: string | null; email_reply_to: string | null } | null;
  tenantQueryError?: Error;
}) => {
  const createNotifications = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const query = {
    graph: jest.fn(async ({ entity, filters }: { entity: string; filters: { id: string[] | string } }) => {
      if (entity === "customer") {
        const ids = filters.id as string[];
        return { data: opts.customers.filter((customer) => ids.includes(customer.id)) };
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

describe("customer-created", () => {
  it("renders the welcome letter under the customer's own shop", async () => {
    const { container, createNotifications } = buildContainer({
      customers: [
        {
          id: "cus_1",
          email: "buyer@example.com",
          first_name: "Оксана",
          has_account: true,
          metadata: { tenant_id: "ten_1" },
        },
      ],
      tenant: {
        id: "ten_1",
        name: "Черкашино",
        handle: "cherkashino",
        domains: [],
        locale_settings: { default_locale: null },
      },
      settings: { email_from_name: null, email_reply_to: "owner@olavka.com" },
    });

    await customerCreatedHandler({
      event: { name: "customer.created", data: { id: "cus_1" } },
      container: container as any,
      pluginOptions: {},
    });

    expect(createNotifications).toHaveBeenCalledTimes(1);
    const call = createNotifications.mock.calls[0][0];
    const shopUrl = shopOrigin({ handle: "cherkashino", primaryDomain: null });

    expect(call.to).toBe("buyer@example.com");
    expect(call.content.text).toContain(`${shopUrl}/store`);
    expect(call.content.text).toContain(`${shopUrl}/account/orders`);
    expect(call.content.text).not.toContain(STOREFRONT_URL);
    expect(call.data.sender).toEqual({ name: "Черкашино", reply_to: "owner@olavka.com" });
  });

  it("falls back to the platform identity for a customer with no shop to resolve", async () => {
    const { container, createNotifications } = buildContainer({
      customers: [{ id: "cus_2", email: "buyer2@example.com", has_account: true, metadata: {} }],
    });

    await customerCreatedHandler({
      event: { name: "customer.created", data: { id: "cus_2" } },
      container: container as any,
      pluginOptions: {},
    });

    const call = createNotifications.mock.calls[0][0];
    expect(call.content.text).toContain(`${STOREFRONT_URL}/store`);
    expect(call.data.sender).toEqual({ name: STORE_NAME, reply_to: null });
  });

  it("falls back to the platform identity, and still mails the letter, when the tenant lookup fails", async () => {
    const { container, createNotifications, logger } = buildContainer({
      customers: [
        {
          id: "cus_3",
          email: "buyer3@example.com",
          has_account: true,
          metadata: { tenant_id: "ten_broken" },
        },
      ],
      tenantQueryError: new Error("db exploded"),
    });

    await customerCreatedHandler({
      event: { name: "customer.created", data: { id: "cus_3" } },
      container: container as any,
      pluginOptions: {},
    });

    expect(createNotifications).toHaveBeenCalledTimes(1);
    const call = createNotifications.mock.calls[0][0];
    expect(call.content.text).toContain(`${STOREFRONT_URL}/store`);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("skips a customer with no account rather than mailing an invitation", async () => {
    const { container, createNotifications } = buildContainer({
      customers: [{ id: "cus_4", email: "guest@example.com", has_account: false }],
    });

    await customerCreatedHandler({
      event: { name: "customer.created", data: { id: "cus_4" } },
      container: container as any,
      pluginOptions: {},
    });

    expect(createNotifications).not.toHaveBeenCalled();
  });
});
