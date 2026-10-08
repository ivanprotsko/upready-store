import { createHmac } from "node:crypto";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";

const shop = { current: "ten_olavka" };

jest.mock("../../resolve-tenant", () => ({
  ...jest.requireActual("../../resolve-tenant"),
  resolveTenantFromPublishableKey: jest.fn(async () => ({
    id: shop.current,
    handle: "olavka",
    name: "Olavka",
    sales_channel_id: "sc_1",
  })),
}));

import { POST as postCode } from "../code/route";
import { POST as postExchange } from "../exchange/route";

/**
 * t-2026-10-08-36, part B: the two routes as the storefront and the school's
 * server call them, against an in-memory cache and lock. The token is the
 * framework's own, so the test checks its payload and its signature with the
 * project's secret.
 */

const SECRET = "test-jwt-secret";

const authIdentity = {
  id: "authid_1",
  app_metadata: { customer_id: "cus_1" },
  provider_identities: [
    { provider: "yandex", entity_id: "ya_1", user_metadata: { email: "buyer@example.test" } },
  ],
};

const makeScope = (identity: Record<string, unknown> | null = authIdentity) => {
  const rows = new Map<string, unknown>();
  const tails = new Map<string, Promise<unknown>>();
  const services: Record<string, unknown> = {
    [Modules.CACHE]: {
      get: async (key: string) => rows.get(key) ?? null,
      set: async (key: string, data: unknown) => {
        rows.set(key, data);
      },
      invalidate: async (key: string) => {
        rows.delete(key);
      },
    },
    [Modules.LOCKING]: {
      execute: <T>(key: string, job: () => Promise<T>) => {
        const run = (tails.get(key) ?? Promise.resolve()).then(job);
        tails.set(key, run.catch(() => undefined));
        return run;
      },
    },
    [Modules.AUTH]: {
      retrieveAuthIdentity: async (id: string) => {
        if (!identity || identity.id !== id) {
          throw new MedusaError(MedusaError.Types.NOT_FOUND, "not found");
        }
        return identity;
      },
    },
    [ContainerRegistrationKeys.CONFIG_MODULE]: {
      projectConfig: { http: { jwtSecret: SECRET, jwtExpiresIn: "1d" } },
    },
  };
  return { resolve: (name: string) => services[name] };
};

const response = () => {
  const res = { body: undefined as unknown, json: (body: unknown) => (res.body = body) };
  return res;
};

const issue = async (scope: ReturnType<typeof makeScope>, returnTo: string, auth: unknown = {
  actor_id: "cus_1",
  actor_type: "customer",
  auth_identity_id: "authid_1",
  auth_provider: "yandex",
}) => {
  const res = response();
  await postCode(
    { scope, auth_context: auth, validatedBody: { return_to: returnTo } } as never,
    res as never,
  );
  return (res.body as { code: string }).code;
};

const exchange = async (scope: ReturnType<typeof makeScope>, code: string) => {
  const res = response();
  await postExchange({ scope, validatedBody: { code } } as never, res as never);
  return (res.body as { token: string }).token;
};

const decode = (token: string) => {
  const [header, payload, signature] = token.split(".");
  const expected = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  return {
    signedWithSecret: expected === signature,
    payload: JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
  };
};

const CALLBACK = "https://school.cherkashina.ru/auth/callback?next=%2Fcourses";

describe("POST /store/tenant/sso/code and /exchange", () => {
  const previous = process.env.SCHOOL_SSO_RETURN_HOSTS;

  beforeEach(() => {
    process.env.SCHOOL_SSO_RETURN_HOSTS = "school.cherkashina.ru";
    shop.current = "ten_olavka";
  });

  afterAll(() => {
    if (previous === undefined) {
      delete process.env.SCHOOL_SSO_RETURN_HOSTS;
    } else {
      process.env.SCHOOL_SSO_RETURN_HOSTS = previous;
    }
  });

  it("trades a code for the buyer's own customer token, once", async () => {
    const scope = makeScope();
    const code = await issue(scope, CALLBACK);
    const token = await exchange(scope, code);
    const { signedWithSecret, payload } = decode(token);

    expect(signedWithSecret).toBe(true);
    expect(payload).toMatchObject({
      actor_id: "cus_1",
      actor_type: "customer",
      auth_identity_id: "authid_1",
      auth_provider: "yandex",
      app_metadata: { customer_id: "cus_1" },
      user_metadata: { email: "buyer@example.test" },
    });
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);

    await expect(exchange(scope, code)).rejects.toMatchObject({
      type: MedusaError.Types.UNAUTHORIZED,
    });
  });

  it("answers 401 to a code another shop's key presents", async () => {
    const scope = makeScope();
    const code = await issue(scope, CALLBACK);

    shop.current = "ten_other";

    await expect(exchange(scope, code)).rejects.toMatchObject({
      type: MedusaError.Types.UNAUTHORIZED,
    });
  });

  it("answers 401 when the auth identity no longer points at that buyer", async () => {
    const scope = makeScope({ ...authIdentity, app_metadata: { customer_id: "cus_2" } });
    const code = await issue(scope, CALLBACK);

    await expect(exchange(scope, code)).rejects.toMatchObject({
      type: MedusaError.Types.UNAUTHORIZED,
    });
  });

  it("mints no code for a host outside SCHOOL_SSO_RETURN_HOSTS", async () => {
    await expect(issue(makeScope(), "https://evil.example/auth/callback")).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    });
  });

  it("mints no code at all while the list is empty", async () => {
    process.env.SCHOOL_SSO_RETURN_HOSTS = "";

    await expect(issue(makeScope(), CALLBACK)).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
    });
  });

  it("mints no code without a signed-in buyer", async () => {
    await expect(issue(makeScope(), CALLBACK, {})).rejects.toMatchObject({
      type: MedusaError.Types.UNAUTHORIZED,
    });
  });
});
