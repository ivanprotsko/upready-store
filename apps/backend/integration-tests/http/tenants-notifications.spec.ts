import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  decodeEmail,
  startSmtpSink,
  startTelegramSink,
  type CapturedEmail,
  type CapturedTelegram,
} from "./sinks";

jest.setTimeout(240_000);

/**
 * Seam test of t08-order-notifications: when an order is placed, two people
 * find out, and each one finds out about THEIR OWN shop.
 *
 * What it proves, each by a request and a delivery rather than by reading code:
 *
 * - the customer's letter is really sent, and every link inside it points at
 *   the shop the order was placed in, not at the engine's own domain;
 * - the inbox shows the shop's own sender name and its reply-to address;
 * - the owner's Telegram message names the shop, the order, the items, the
 *   customer and the panel link;
 * - tenant B's owner does NOT receive tenant A's order, and a code minted by A
 *   binds only A;
 * - a link code is single use and expires;
 * - a channel that fails is visible to the owner afterwards, not only in a log.
 *
 * The two sinks (`sinks.ts`) speak SMTP and the Bot API for real; nothing in
 * `src` is mocked. Their ports are fixed because `medusa-config.ts` reads
 * `SMTP_HOST`/`SMTP_PORT` at boot, which happens before any `beforeAll` here.
 */

const SMTP_PORT = 21587;
const TELEGRAM_PORT = 21588;
const BOT_TOKEN = "seam-bot-token";
const LINK_SECRET = "seam-link-secret";

process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(SMTP_PORT);
process.env.SMTP_SECURE = "false";
process.env.SMTP_FROM = "orders@upready.test";
process.env.SMTP_REPLY_TO = "platform@upready.test";
process.env.STORE_NAME = "Upready Platform";
process.env.STORE_EMAIL = "platform@upready.test";
// The shop's own address is built from the base domain plus the scheme and port
// of this fallback, which is what a stand looks like.
process.env.TENANT_BASE_DOMAINS = "localhost";
process.env.STOREFRONT_URL = "http://localhost:8061";
process.env.PANEL_PUBLIC_URL = "http://localhost:5191";
process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${TELEGRAM_PORT}`;
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.TELEGRAM_BOT_USERNAME = "upreadystore_bot";
process.env.TELEGRAM_LINK_SECRET = LINK_SECRET;
process.env.STOREFRONT_DEFAULT_LOCALE = "ru";
// The starter catalog refuses to seed without a public base for its images
// (`abstract-datasets.ts`); the value is never fetched in this test.
process.env.STORE_PROFILES_MEDIA_BASE_URL ||= "https://shipshift.dev/static/store-profiles";
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

type Registered = {
  token: string;
  tenant: { id: string; handle: string; name: string; api_key: { token: string } };
};

const PASSWORD = "supersecret-owner";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: order notifications", () => {
      let a: Registered;
      let b: Registered;
      let regionId: string;
      let emails: CapturedEmail[];
      let telegram: CapturedTelegram[];
      let closeSmtp: () => Promise<void>;
      let closeTelegram: () => Promise<void>;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const withKey = (key: string) => ({ headers: { "x-publishable-api-key": key } });
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      /** The bus is in memory here, so a subscriber lands a moment after the request. */
      const until = async <T>(read: () => T | undefined, attempts = 40): Promise<T | undefined> => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const value = read();
          if (value !== undefined) {
            return value;
          }
          await wait(250);
        }
        return undefined;
      };

      /**
       * `until` for a value that has to be fetched rather than read off a sink.
       *
       * The delivery stamps on the tenant row are written by the subscribers
       * AFTER the message leaves, so a letter already in the SMTP sink proves
       * the send and not yet the record of it (measured: `[smtp] Email sent` at
       * 00:38:04, `[order-placed-email] Sent to …` a second later). A single
       * read of `/tenants/notification-settings` can land in between.
       */
      const untilAsync = async <T>(
        read: () => Promise<T | undefined>,
        attempts = 40,
      ): Promise<T | undefined> => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const value = await read();
          if (value !== undefined) {
            return value;
          }
          await wait(250);
        }
        return undefined;
      };

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
        expect(registration.status).toBe(200);
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);
        return { token: login.data.token, tenant: created.data.tenant };
      };

      /** Links a chat the way the bot does: mint a code in the panel, redeem it as the bot. */
      const linkTelegram = async (tenant: Registered, chatId: string, chatTitle: string) => {
        const minted = await api.post(
          "/tenants/notification-settings/telegram/code",
          {},
          bearer(tenant.token),
        );
        expect(minted.status).toBe(200);
        const code = new URL(minted.data.deep_link).searchParams.get("start");
        const linked = await api.post(
          "/telegram/link",
          { code, chat_id: chatId, chat_title: chatTitle, language_code: "ru" },
          { headers: { "x-telegram-link-secret": LINK_SECRET } },
        );
        expect(linked.status).toBe(200);
        expect(linked.data.status).toBe("linked");
        return { code, linked };
      };

      /** A cart of the shop's own catalog, completed into an order. */
      const placeOrder = async (tenant: Registered) => {
        const headers = withKey(tenant.tenant.api_key.token);
        const products = await api.get(
          `/store/products?region_id=${regionId}&limit=1&fields=id,*variants`,
          headers,
        );
        const variant = products.data.products[0]?.variants?.[0];
        const items = variant ? [{ variant_id: variant.id, quantity: 2 }] : [];
        const cart = (
          await api.post(
            "/store/carts",
            { region_id: regionId, email: `buyer@${tenant.tenant.handle}.test`, items },
            headers,
          )
        ).data.cart;
        const address = {
          first_name: "Пробный",
          last_name: "Покупатель",
          phone: "+7 900 000-00-00",
          address_1: "ул. Ленина, 1",
          city: "Москва",
          // `province` is what `completeCartWorkflow` refuses an order without,
          // for every country the tariff module ships a region list for
          // (`missingPostableFields` in `workflows/hooks/validate-cart-shipping-address.ts`,
          // b03-shipping-zones-weight). The value is the region's own `province`
          // string from `shipping-tariffs/ru-regions.ts`, because a delivery zone
          // restricted to regions matches on exactly that string.
          province: "г Москва",
          postal_code: "101000",
          country_code: "ru",
        };
        await api.post(`/store/carts/${cart.id}`, { shipping_address: address, billing_address: address }, headers);
        const options = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, headers)).data.shipping_options ?? [];
        if (options[0]) {
          await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: options[0].id }, headers);
        }
        const collection = (await api.post("/store/payment-collections", { cart_id: cart.id }, headers)).data
          .payment_collection;
        await api.post(
          `/store/payment-collections/${collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          headers,
        );
        const completed = await api.post(`/store/carts/${cart.id}/complete`, {}, headers);
        expect(completed.status).toBe(200);
        expect(completed.data.type).toBe("order");
        return completed.data.order as { id: string; display_id: number; email: string };
      };

      beforeAll(async () => {
        const smtp = await startSmtpSink(SMTP_PORT);
        const tg = await startTelegramSink(TELEGRAM_PORT);
        emails = smtp.messages;
        telegram = tg.calls;
        closeSmtp = smtp.close;
        closeTelegram = tg.close;

        const container = getContainer();
        const region = await container.resolve(Modules.REGION).createRegions({
          name: "Russia",
          currency_code: "rub",
          countries: ["ru"],
        });
        regionId = region.id;

        a = await registerTenant("acme", "Магазин Акме");
        b = await registerTenant("globex", "Глобекс");

        expect((await api.post("/tenants/seed", { preset: "geist" }, bearer(a.token))).status).toBe(201);
        expect((await api.post("/tenants/seed", { preset: "geist" }, bearer(b.token))).status).toBe(201);
      });

      afterAll(async () => {
        await closeSmtp?.();
        await closeTelegram?.();
      });

      it("starts with nothing configured and says so instead of guessing", async () => {
        const read = await api.get("/tenants/notification-settings", bearer(a.token));
        expect(read.status).toBe(200);
        expect(read.data.settings.email).toMatchObject({
          from_name: null,
          reply_to: null,
          effective_from_name: "Магазин Акме",
          configured: true,
        });
        expect(read.data.settings.telegram).toMatchObject({
          connected: false,
          pending_link: false,
          configured: true,
          bot_username: "upreadystore_bot",
        });
        expect(read.data.settings.email.last.status).toBeNull();
        expect(read.data.shop.storefront_url).toBe("http://acme.localhost:8061");
      });

      it("stores the shop's sender identity and hands back what the inbox will show", async () => {
        const saved = await api.put(
          "/tenants/notification-settings",
          { email_from_name: "Акме", email_reply_to: "hello@acme.test" },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        expect(saved.data.settings.email).toMatchObject({
          from_name: "Акме",
          reply_to: "hello@acme.test",
          effective_from_name: "Акме",
        });
      });

      it("refuses an address that is not one, and clears on an empty string", async () => {
        const bad = await failed(
          api.put("/tenants/notification-settings", { email_reply_to: "not-an-address" }, bearer(a.token)),
        );
        expect(bad.status).toBe(400);

        const cleared = await api.put("/tenants/notification-settings", { email_reply_to: "" }, bearer(b.token));
        expect(cleared.status).toBe(200);
        expect(cleared.data.settings.email.reply_to).toBeNull();
      });

      describe("the link between a shop and a chat", () => {
        it("binds the chat the code was redeemed from, once", async () => {
          const { code } = await linkTelegram(b, "-100999", "Чат Глобекса");

          const read = await api.get("/tenants/notification-settings", bearer(b.token));
          expect(read.data.settings.telegram).toMatchObject({
            connected: true,
            chat_title: "Чат Глобекса",
            pending_link: false,
          });

          // Single use: the same code is worth nothing a second time.
          const replay = await failed(
            api.post(
              "/telegram/link",
              { code, chat_id: "-100777", chat_title: "Чужой чат" },
              { headers: { "x-telegram-link-secret": LINK_SECRET } },
            ),
          );
          expect(replay.status).toBe(404);
          expect(replay.data.status).toBe("unknown");

          const stillB = await api.get("/tenants/notification-settings", bearer(b.token));
          expect(stillB.data.settings.telegram.chat_title).toBe("Чат Глобекса");
        });

        it("refuses a caller that does not know the shared secret", async () => {
          const minted = await api.post("/tenants/notification-settings/telegram/code", {}, bearer(a.token));
          const code = new URL(minted.data.deep_link).searchParams.get("start");

          const noSecret = await failed(api.post("/telegram/link", { code, chat_id: "-1" }, {}));
          expect(noSecret.status).toBe(401);

          const wrongSecret = await failed(
            api.post(
              "/telegram/link",
              { code, chat_id: "-1" },
              { headers: { "x-telegram-link-secret": "not-the-secret" } },
            ),
          );
          expect(wrongSecret.status).toBe(401);

          // And the shop is still unlinked afterwards.
          const read = await api.get("/tenants/notification-settings", bearer(a.token));
          expect(read.data.settings.telegram.connected).toBe(false);
          expect(read.data.settings.telegram.pending_link).toBe(true);
        });

        it("sends a real test message to the linked chat, and refuses one before there is a chat", async () => {
          // Every test starts from the snapshot taken after `beforeAll`, so the
          // chat this one needs is linked inside it (@medusajs/test-utils 2.19
          // restores the database before each test).
          await linkTelegram(b, "-100999", "Чат Глобекса");
          const before = telegram.length;
          const sent = await api.post("/tenants/notification-settings/telegram/test", {}, bearer(b.token));
          expect(sent.status).toBe(200);
          expect(sent.data.sent).toBe(true);

          const call = telegram[before];
          expect(call.method).toBe("sendMessage");
          expect(call.token).toBe(BOT_TOKEN);
          expect(call.body.chat_id).toBe("-100999");
          expect(String(call.body.text)).toContain("Глобекс");

          const unlinked = await failed(
            api.post("/tenants/notification-settings/telegram/test", {}, bearer(a.token)),
          );
          expect(unlinked.status).toBe(400);
        });
      });

      describe("a placed order", () => {
        it("mails the customer a letter whose links are the SHOP's, and tells only that shop's owner", async () => {
          await api.put(
            "/tenants/notification-settings",
            { email_from_name: "Акме", email_reply_to: "hello@acme.test" },
            bearer(a.token),
          );
          await linkTelegram(a, "-100111", "Чат Акме");
          const emailsBefore = emails.length;
          const telegramBefore = telegram.length;

          const order = await placeOrder(a);

          const captured = await until(() =>
            emails.slice(emailsBefore).find((message) => message.to.join(",").includes("buyer@acme.test")),
          );
          expect(captured).toBeDefined();
          const letter = decodeEmail(captured!);

          // Every customer-facing link is the shop's own address — read the way
          // a mail client reads it, with the transfer encodings undone.
          expect(letter.body).toContain(`http://acme.localhost:8061/order/${order.id}/confirmed`);
          expect(letter.body).toContain("http://acme.localhost:8061/account/orders");
          expect(letter.body).not.toMatch(/http:\/\/localhost:8061/);

          // The inbox shows the shop, and a reply goes to the shop, while the
          // envelope stays the platform's own account.
          expect(letter.from).toBe("Акме <orders@upready.test>");
          expect(letter.replyTo).toBe("hello@acme.test");
          expect(captured!.from).toContain("orders@upready.test");

          // The owner's message: the shop, the order, the items, the buyer, the panel.
          const message = await until(() =>
            telegram
              .slice(telegramBefore)
              .find((call) => String(call.body.text ?? "").includes(String(order.display_id))),
          );
          expect(message).toBeDefined();
          expect(message!.body.chat_id).toBe("-100111");
          const text = String(message!.body.text);
          expect(text).toContain("Магазин: Магазин Акме");
          expect(text).toContain("Пробный Покупатель");
          expect(text).toContain("+7 900 000-00-00");
          expect(text).toContain("Москва");
          expect(text).toContain(`http://localhost:5191/orders/${order.id}`);

          // Isolation: B's chat heard nothing about A's order.
          const toB = telegram
            .slice(telegramBefore)
            .filter((call) => call.body.chat_id === "-100999");
          expect(toB).toHaveLength(0);

          // And the owner sees the delivery without opening a log.
          const settings = await untilAsync(async () => {
            const read = await api.get("/tenants/notification-settings", bearer(a.token));
            const current = read.data.settings;
            return current?.telegram?.last?.status && current?.email?.last?.status
              ? current
              : undefined;
          });
          expect(settings).toBeDefined();
          expect(settings.telegram.last.status).toBe("ok");
          expect(settings.telegram.last.order).toBe(String(order.display_id));
          expect(settings.email.last.status).toBe("ok");
        });

        it("keeps tenant B's own order to tenant B", async () => {
          await linkTelegram(a, "-100111", "Чат Акме");
          await linkTelegram(b, "-100999", "Чат Глобекса");
          const telegramBefore = telegram.length;
          const order = await placeOrder(b);

          const message = await until(() =>
            telegram
              .slice(telegramBefore)
              .find((call) => String(call.body.text ?? "").includes(String(order.display_id))),
          );
          expect(message).toBeDefined();
          expect(message!.body.chat_id).toBe("-100999");
          expect(String(message!.body.text)).toContain("Глобекс");

          expect(
            telegram.slice(telegramBefore).filter((call) => call.body.chat_id === "-100111"),
          ).toHaveLength(0);
        });

        it("unlinking stops the messages and keeps the record of what already happened", async () => {
          await linkTelegram(b, "-100999", "Чат Глобекса");
          const testSent = await api.post("/tenants/notification-settings/telegram/test", {}, bearer(b.token));
          expect(testSent.status).toBe(200);

          const removed = await api.delete("/tenants/notification-settings/telegram", bearer(b.token));
          expect(removed.status).toBe(200);
          expect(removed.data.settings.telegram.connected).toBe(false);
          // What happened, happened: the last delivery is still on the screen.
          expect(removed.data.settings.telegram.last.status).toBe("ok");

          const telegramBefore = telegram.length;
          const order = await placeOrder(b);
          await wait(2000);
          expect(
            telegram.slice(telegramBefore).filter((call) => String(call.body.text ?? "").includes(String(order.display_id))),
          ).toHaveLength(0);

          const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
          const rows = await pg("tenant_notification_settings")
            .select("telegram_chat_id")
            .where({ tenant_id: b.tenant.id });
          expect(rows[0].telegram_chat_id).toBeNull();
        });
      });
    });
  },
});
