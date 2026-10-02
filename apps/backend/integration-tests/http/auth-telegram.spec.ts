import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHash, createHmac } from "node:crypto";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

jest.setTimeout(240_000);

/**
 * Seam test of «Войти через Telegram» through the real HTTP surface
 * (t-2026-10-02-telegram-auth): the per-shop bot in the panel, the provider at
 * `/auth/customer/telegram`, first sign-in → customer, the next sign-in finding
 * it, «Привязать Telegram», and the synthetic address being reserved.
 *
 * Telegram itself is never reached: `TELEGRAM_API_BASE_URL` points at a local
 * stand-in that answers `getMe` for ONE token, and every widget payload and
 * `initData` string is signed here with that token, exactly as Telegram signs
 * them. Runner facts as in the other specs: `DB_HOST` must be the literal
 * `localhost`, and the database is a throwaway one.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

const BOT_TOKEN = "777000111:seam-telegram-bot-token-AAAA";
const BOT_USERNAME = "seam_shop_bot";
const OTHER_TOKEN = "888000222:some-other-bot-token-BBBB";
const PASSWORD = "supersecret-owner";

type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { token: string } };
};

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };

const nowSec = () => Math.floor(Date.now() / 1000);

const dataCheckString = (fields: Record<string, string>) =>
  Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

/** A Login Widget payload, signed the way Telegram signs it: key = SHA256(bot token). */
const signWidget = (user: TgUser, token = BOT_TOKEN, authDate = nowSec()) => {
  const fields: Record<string, string> = { auth_date: String(authDate) };
  for (const [key, value] of Object.entries(user)) {
    fields[key] = String(value);
  }
  const secret = createHash("sha256").update(token).digest();
  return { ...fields, hash: createHmac("sha256", secret).update(dataCheckString(fields)).digest("hex") };
};

/** A Mini App `initData` string: key = HMAC_SHA256("WebAppData", bot token). */
const signInitData = (user: TgUser, token = BOT_TOKEN, authDate = nowSec()) => {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: "AAHseam",
    user: JSON.stringify(user),
  };
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString(fields)).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
};

const jwtPayload = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
    actor_id: string;
    auth_identity_id: string;
  };

/** Stands in for api.telegram.org: `getMe` succeeds for BOT_TOKEN only. */
const startBotApi = async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/bot${BOT_TOKEN}/getMe`) {
      res.end(
        JSON.stringify({
          ok: true,
          result: { id: 777000111, is_bot: true, first_name: "Seam shop", username: BOT_USERNAME },
        }),
      );
      return;
    }
    res.statusCode = 401;
    res.end(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.TELEGRAM_API_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return server;
};

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("auth: sign in with Telegram", () => {
      let botApi: http.Server;
      let shop: Registered;
      let botless: Registered;

      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const store = (owner: Registered, token?: string) => ({
        headers: {
          "x-publishable-api-key": owner.tenant.api_key.token,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email,
          password: PASSWORD,
        });
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        return { token: login.data.token, tenant: created.data.tenant };
      };

      const connectBot = async () => {
        const saved = await api.put(
          "/tenants/telegram-bot",
          { username: `@${BOT_USERNAME}`, token: BOT_TOKEN },
          bearer(shop.token),
        );
        expect(saved.status).toBe(200);
        return saved;
      };

      /** The storefront's whole first-sign-in dance, as `lib/data/telegram-auth.ts` runs it. */
      const telegramSignIn = async (body: Record<string, string>, user: TgUser) => {
        const auth = await api.post("/auth/customer/telegram", body, store(shop));
        expect(auth.status).toBe(200);
        let token: string = auth.data.token;
        if (!jwtPayload(token).actor_id) {
          const created = await api.post(
            "/store/customers",
            {
              email: `tg_${user.id}@telegram.local`,
              first_name: user.first_name ?? "",
              last_name: user.last_name ?? "",
              metadata: { telegram_id: user.id, telegram_username: user.username ?? null },
            },
            store(shop, token),
          );
          expect(created.status).toBe(200);
          const refreshed = await api.post("/auth/token/refresh", {}, bearer(token));
          token = refreshed.data.token;
        }
        return token;
      };

      const registerEmailBuyer = async (email: string) => {
        const registration = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: PASSWORD },
          store(shop),
        );
        const created = await api.post(
          "/store/customers",
          { email, first_name: "Email", last_name: "Buyer" },
          store(shop, registration.data.token),
        );
        expect(created.status).toBe(200);
        const login = await api.post(
          "/auth/customer/emailpass",
          { email, password: PASSWORD },
          store(shop),
        );
        return { id: created.data.customer.id as string, token: login.data.token as string };
      };

      beforeAll(async () => {
        botApi = await startBotApi();
        shop = await registerTenant("tgshop", "TG Shop");
        botless = await registerTenant("nobot", "No Bot");
      });

      afterAll(async () => {
        await new Promise((resolve) => botApi.close(resolve));
      });

      it("stores the shop's bot once Telegram confirms the token, and never hands the token back", async () => {
        const saved = await connectBot();
        expect(saved.data.settings.username).toBe(BOT_USERNAME);
        expect(JSON.stringify(saved.data)).not.toContain(BOT_TOKEN);

        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
        const rows = await pg("tenant_integration_secret").where({ provider: "telegram" });
        expect(rows).toHaveLength(1);
        expect(rows[0].tenant_id).toBe(shop.tenant.id);
        expect(JSON.stringify(rows)).not.toContain(BOT_TOKEN);

        const publicView = await api.get("/store/telegram-bot", store(shop));
        expect(publicView.data).toEqual({ bot: { username: BOT_USERNAME } });
        expect(JSON.stringify(publicView.data)).not.toContain(BOT_TOKEN);
      });

      it("refuses a token Telegram does not accept, and a username that is not that token's bot", async () => {
        const badToken = await failed(
          api.put("/tenants/telegram-bot", { username: BOT_USERNAME, token: OTHER_TOKEN }, bearer(shop.token)),
        );
        expect(badToken.status).toBe(400);

        const wrongName = await failed(
          api.put("/tenants/telegram-bot", { username: "someone_else_bot", token: BOT_TOKEN }, bearer(shop.token)),
        );
        expect(wrongName.status).toBe(400);
      });

      it("a shop without a bot has no Telegram sign-in at all", async () => {
        await connectBot();
        const publicView = await api.get("/store/telegram-bot", store(botless));
        expect(publicView.data).toEqual({ bot: null });

        const refused = await failed(
          api.post("/auth/customer/telegram", signWidget({ id: 501 }), store(botless)),
        );
        expect(refused.status).toBe(401);
        expect(refused.data.message).toMatch(/not configured/i);
      });

      it("refuses a tampered, a stale and a foreign-bot payload", async () => {
        await connectBot();

        const tampered = { ...signWidget({ id: 502, first_name: "Real" }), first_name: "Forged" };
        expect((await failed(api.post("/auth/customer/telegram", tampered, store(shop)))).status).toBe(401);

        const stale = signWidget({ id: 502 }, BOT_TOKEN, nowSec() - 2 * 86_400);
        const staleAnswer = await failed(api.post("/auth/customer/telegram", stale, store(shop)));
        expect(staleAnswer.status).toBe(401);
        expect(staleAnswer.data.message).toMatch(/expired/i);

        const foreign = signWidget({ id: 502 }, OTHER_TOKEN);
        expect((await failed(api.post("/auth/customer/telegram", foreign, store(shop)))).status).toBe(401);

        const forgedInitData = signInitData({ id: 502 }).replace("502", "503");
        expect(
          (await failed(api.post("/auth/customer/telegram", { initData: forgedInitData }, store(shop)))).status,
        ).toBe(401);
      });

      it("creates the customer on the first sign-in and finds it on the next, widget or Mini App", async () => {
        await connectBot();
        const user: TgUser = { id: 600100, first_name: "Анна", username: "anna_tg" };

        const first = await telegramSignIn(signWidget(user), user);
        const customerId = jwtPayload(first).actor_id;
        expect(customerId).toBeTruthy();

        const me = await api.get("/store/customers/me", store(shop, first));
        expect(me.data.customer.email).toBe(`tg_${user.id}@telegram.local`);
        expect(me.data.customer.first_name).toBe("Анна");
        expect(me.data.customer.metadata.telegram_username).toBe("anna_tg");

        // The next sign-in, from inside the Mini App, needs no account step.
        const again = await api.post(
          "/auth/customer/telegram",
          { initData: signInitData(user) },
          store(shop),
        );
        expect(again.status).toBe(200);
        expect(jwtPayload(again.data.token).actor_id).toBe(customerId);
      });

      it("reserves the synthetic address for the Telegram identity it belongs to", async () => {
        await connectBot();

        const register = await failed(
          api.post(
            "/auth/customer/emailpass/register",
            { email: "tg_700@telegram.local", password: PASSWORD },
            store(shop),
          ),
        );
        expect(register.status).toBe(400);

        // A real e-mail identity cannot create a customer under someone's synthetic address.
        const registration = await api.post(
          "/auth/customer/emailpass/register",
          { email: "squatter@example.com", password: PASSWORD },
          store(shop),
        );
        const squat = await failed(
          api.post(
            "/store/customers",
            { email: "tg_700@telegram.local" },
            store(shop, registration.data.token),
          ),
        );
        expect(squat.status).toBe(400);

        // Nor can another Telegram identity.
        const other = await api.post("/auth/customer/telegram", signWidget({ id: 701 }), store(shop));
        const wrongOwner = await failed(
          api.post("/store/customers", { email: "tg_700@telegram.local" }, store(shop, other.data.token)),
        );
        expect(wrongOwner.status).toBe(400);
      });

      it("links Telegram to an e-mail account, and refuses the same Telegram for a second account", async () => {
        await connectBot();
        const buyer = await registerEmailBuyer("buyer-a@example.com");
        const user: TgUser = { id: 800200, first_name: "Борис", username: "boris_tg" };

        const forged = { ...signWidget(user), id: "800201" };
        const forgedLink = await failed(
          api.post("/store/customers/me/telegram-link", forged, store(shop, buyer.token)),
        );
        expect(forgedLink.status).toBe(400);

        const linked = await api.post(
          "/store/customers/me/telegram-link",
          signWidget(user),
          store(shop, buyer.token),
        );
        expect(linked.status).toBe(200);
        expect(linked.data).toEqual({ linked: true, telegram_username: "boris_tg" });

        // A second press from a stale page is not an error.
        const again = await api.post(
          "/store/customers/me/telegram-link",
          signWidget(user),
          store(shop, buyer.token),
        );
        expect(again.status).toBe(200);

        // Signing in with that Telegram now opens the e-mail account itself.
        const viaTelegram = await api.post("/auth/customer/telegram", signWidget(user), store(shop));
        expect(jwtPayload(viaTelegram.data.token).actor_id).toBe(buyer.id);

        const me = await api.get("/store/customers/me", store(shop, viaTelegram.data.token));
        expect(me.data.customer.email).toBe("buyer-a@example.com");

        // One person, one account.
        const second = await registerEmailBuyer("buyer-b@example.com");
        const taken = await failed(
          api.post("/store/customers/me/telegram-link", signWidget(user), store(shop, second.token)),
        );
        expect(taken.status).toBe(400);
        expect(taken.data.message).toMatch(/already linked/i);

        // Writing someone's telegram_id into your own metadata does not hand you their sign-in.
        await api.post(
          "/store/customers/me",
          { metadata: { telegram_id: 900300 } },
          store(shop, second.token),
        );
        const stranger: TgUser = { id: 900300, first_name: "Вера" };
        const strangerToken = await telegramSignIn(signWidget(stranger), stranger);
        expect(jwtPayload(strangerToken).actor_id).not.toBe(second.id);
      });
    });
  },
});
