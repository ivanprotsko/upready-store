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
import passwordResetEmailHandler from "../password-reset-email";

/**
 * t-2026-10-02-shop-aware-account-emails: a CUSTOMER'S reset link has to open
 * the reset page of the shop they asked from, never the platform's own site,
 * and a shop-less or unresolvable request must still mail a working platform
 * link rather than nothing. The panel (tenant) branch is untouched by this
 * task and gets its own regression coverage here.
 */

type FakeTenant = {
  id: string;
  name?: string;
  handle?: string;
  domains?: Array<{ host?: string; is_primary?: boolean }>;
  locale_settings?: { default_locale?: string | null } | null;
};

const buildContainer = (opts: {
  tenant?: FakeTenant | null;
  settings?: { email_from_name: string | null; email_reply_to: string | null } | null;
  tenantQueryError?: Error;
}) => {
  const createNotifications = jest.fn();
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const query = {
    graph: jest.fn(async ({ entity, filters }: { entity: string; filters: Record<string, unknown> }) => {
      if (entity === "customer" || entity === "tenant_admin") {
        // The locale lookup: nobody stored one in this scenario.
        return { data: [] };
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
  it("opens the reset page of the customer's own shop", async () => {
    const { container, createNotifications } = buildContainer({
      tenant: {
        id: "ten_1",
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
          metadata: { tenant_id: "ten_1" },
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
    expect(call.content.text).not.toContain(STOREFRONT_URL);
    expect(call.data.sender).toEqual({ name: "Черкашино", reply_to: "owner@olavka.com" });
  });

  it("falls back to the platform's own reset page for a shop-less customer", async () => {
    const { container, createNotifications } = buildContainer({});

    await passwordResetEmailHandler({
      event: {
        name: "auth.password_reset",
        data: { entity_id: "buyer2@example.com", token: "tok_2", actor_type: "customer" },
      },
      container: container as any,
      pluginOptions: {},
    });

    const call = createNotifications.mock.calls[0][0];
    expect(call.content.text).toContain(`${STOREFRONT_URL}/reset-password?token=tok_2&email=buyer2%40example.com`);
    expect(call.data.sender).toEqual({ name: STORE_NAME, reply_to: null });
  });

  it("falls back to the platform's own reset page, and still mails the letter, when the tenant lookup fails", async () => {
    const { container, createNotifications, logger } = buildContainer({
      tenantQueryError: new Error("db exploded"),
    });

    await passwordResetEmailHandler({
      event: {
        name: "auth.password_reset",
        data: {
          entity_id: "buyer3@example.com",
          token: "tok_3",
          actor_type: "customer",
          metadata: { tenant_id: "ten_broken" },
        },
      },
      container: container as any,
      pluginOptions: {},
    });

    expect(createNotifications).toHaveBeenCalledTimes(1);
    const call = createNotifications.mock.calls[0][0];
    expect(call.content.text).toContain(`${STOREFRONT_URL}/reset-password?token=tok_3`);
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
            token: "tok_4",
            actor_type: "tenant",
            metadata: { tenant_id: "ten_1" },
          },
        },
        container: container as any,
        pluginOptions: {},
      });

      expect(createNotifications).toHaveBeenCalledTimes(1);
      const call = createNotifications.mock.calls[0][0];
      expect(call.content.text).toContain("https://panel.shipshift.dev/reset-password?token=tok_4");
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
