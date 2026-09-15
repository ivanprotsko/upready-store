/**
 * The provider itself, with the two network calls of `../lib/oauth` mocked and
 * everything else real: the authorize URL, the signed state and the identity
 * mapping all run for real, so a change to any of them shows up here.
 */

jest.mock("../lib/oauth", () => {
  const actual = jest.requireActual("../lib/oauth");
  return {
    ...actual,
    exchangeCodeForToken: jest.fn(),
    fetchYandexProfile: jest.fn(),
  };
});

import { MedusaError } from "@medusajs/framework/utils";

import { exchangeCodeForToken, fetchYandexProfile } from "../lib/oauth";
import { decodeState, encodeState } from "../lib/state";
import { YandexAuthService, type YandexAuthOptions } from "../services/yandex";

const CLIENT_SECRET = "s3cr3t-never-in-a-message";
const STATE_SECRET = "state-secret-for-tests";

const OPTIONS: YandexAuthOptions = {
  clientId: "client-123",
  clientSecret: CLIENT_SECRET,
  callbackUrl: "http://localhost:3101/api/yandex-callback",
  stateSecret: STATE_SECRET,
  allowedCallbackOrigins: ["https://cherkashino.ru"],
};

const logs: string[] = [];
const logger = {
  error: (m: string) => logs.push(m),
  warn: (m: string) => logs.push(m),
  info: (m: string) => logs.push(m),
  debug: (m: string) => logs.push(m),
} as any;

const makeService = (overrides: Partial<YandexAuthOptions> = {}) =>
  new YandexAuthService({ logger }, { ...OPTIONS, ...overrides });

/** The slice of AuthIdentityProviderService the provider actually touches. */
const makeIdentityService = (existing?: Record<string, unknown>) => {
  const store = new Map<string, any>();
  if (existing) {
    store.set(existing.entity_id as string, existing);
  }
  return {
    store,
    retrieve: jest.fn(async ({ entity_id }: { entity_id: string }) => {
      const hit = store.get(entity_id);
      if (!hit) {
        const error: any = new Error("not found");
        error.type = MedusaError.Types.NOT_FOUND;
        throw error;
      }
      return hit;
    }),
    create: jest.fn(async (data: any) => {
      const row = { id: `authid_${data.entity_id}`, ...data };
      store.set(data.entity_id, row);
      return row;
    }),
    update: jest.fn(async (entityId: string, data: any) => {
      const row = { ...store.get(entityId), ...data };
      store.set(entityId, row);
      return row;
    }),
    setState: jest.fn(),
    getState: jest.fn(),
  } as any;
};

const PROFILE = {
  id: "1130000012345678",
  login: "oksana",
  first_name: "Оксана",
  last_name: "Черкашина",
  real_name: "Оксана Черкашина",
  default_email: "oksana@example.com",
};

beforeEach(() => {
  logs.length = 0;
  (exchangeCodeForToken as jest.Mock).mockReset();
  (fetchYandexProfile as jest.Mock).mockReset();
});

describe("validateOptions", () => {
  it("names the variable that is missing", () => {
    expect(() =>
      YandexAuthService.validateOptions({ ...OPTIONS, clientId: "" }),
    ).toThrow(/YANDEX_CLIENT_ID/);
    expect(() =>
      YandexAuthService.validateOptions({ ...OPTIONS, clientSecret: "" }),
    ).toThrow(/YANDEX_CLIENT_SECRET/);
    expect(() =>
      YandexAuthService.validateOptions({ ...OPTIONS, callbackUrl: "" }),
    ).toThrow(/YANDEX_CALLBACK_URL/);
    expect(() =>
      YandexAuthService.validateOptions({ ...OPTIONS, stateSecret: "" }),
    ).toThrow(/JWT_SECRET/);
    expect(() => YandexAuthService.validateOptions(OPTIONS)).not.toThrow();
  });

  it("is the provider Medusa exposes as /auth/customer/yandex", () => {
    expect(YandexAuthService.identifier).toBe("yandex");
  });
});

describe("authenticate", () => {
  it("returns the consent-screen URL with the five parameters and a signed state", async () => {
    const service = makeService();

    const result = await service.authenticate(
      {
        body: {
          callback_url: "https://cherkashino.ru/api/yandex-callback",
          tenant: "cherkashino",
          locale: "ru",
          return_to: "/ru/account",
          nonce: "n-1",
        },
      } as any,
      makeIdentityService(),
    );

    expect(result.success).toBe(true);
    const url = new URL(result.location!);
    expect(url.origin + url.pathname).toBe("https://oauth.yandex.ru/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://cherkashino.ru/api/yandex-callback",
    );

    const state = url.searchParams.get("state")!;
    expect(state).toContain(".");
    const verdict = decodeState(state, STATE_SECRET);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.payload.tn).toBe("cherkashino");
      expect(verdict.payload.lc).toBe("ru");
      expect(verdict.payload.rt).toBe("/ru/account");
      expect(verdict.payload.n).toBe("n-1");
    }

    // The consent URL is public, so it must never carry the secret.
    expect(result.location).not.toContain(CLIENT_SECRET);
  });

  it("falls back to the configured callback URL", async () => {
    const result = await makeService().authenticate(
      { body: {} } as any,
      makeIdentityService(),
    );

    expect(new URL(result.location!).searchParams.get("redirect_uri")).toBe(
      "http://localhost:3101/api/yandex-callback",
    );
  });

  it("refuses a callback URL from an origin nobody allowed", async () => {
    const result = await makeService().authenticate(
      { body: { callback_url: "https://evil.example.com/api/yandex-callback" } } as any,
      makeIdentityService(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not allowed/i);
    expect(result.location).toBeUndefined();
  });

  it("passes Yandex's own error through when the consent screen bounced back", async () => {
    const result = await makeService().authenticate(
      { query: { error: "access_denied", error_description: "Отказано" } } as any,
      makeIdentityService(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Отказано");
  });
});

describe("register", () => {
  it("is not a thing for Yandex", async () => {
    await expect(makeService().register({} as any)).rejects.toThrow(
      /does not support registration/,
    );
  });
});

describe("validateCallback", () => {
  const validState = () =>
    encodeState(
      {
        cb: "https://cherkashino.ru/api/yandex-callback",
        tn: "cherkashino",
        lc: "ru",
        rt: "/ru/account",
        n: "n-1",
      },
      STATE_SECRET,
    );

  it("creates the identity from the exchanged profile", async () => {
    (exchangeCodeForToken as jest.Mock).mockResolvedValue("at-1");
    (fetchYandexProfile as jest.Mock).mockResolvedValue(PROFILE);

    const identityService = makeIdentityService();
    const result = await makeService().validateCallback(
      { query: { code: "code-1", state: validState() } } as any,
      identityService,
    );

    expect(result.success).toBe(true);
    expect(identityService.create).toHaveBeenCalledTimes(1);

    const created = identityService.create.mock.calls[0][0];
    expect(created.entity_id).toBe("1130000012345678");
    expect(created.user_metadata.email).toBe("oksana@example.com");
    expect(created.user_metadata.name).toBe("Оксана Черкашина");

    // The exchange repeats the redirect_uri the code was issued for, and that
    // value survives only inside the state.
    expect((exchangeCodeForToken as jest.Mock).mock.calls[0][0].redirectUri).toBe(
      "https://cherkashino.ru/api/yandex-callback",
    );
  });

  it("refreshes the profile of a returning buyer instead of duplicating it", async () => {
    (exchangeCodeForToken as jest.Mock).mockResolvedValue("at-1");
    (fetchYandexProfile as jest.Mock).mockResolvedValue({
      ...PROFILE,
      default_email: "new@example.com",
    });

    const identityService = makeIdentityService({
      entity_id: "1130000012345678",
      user_metadata: { email: "oksana@example.com" },
    });

    const result = await makeService().validateCallback(
      { query: { code: "code-1", state: validState() } } as any,
      identityService,
    );

    expect(result.success).toBe(true);
    expect(identityService.create).not.toHaveBeenCalled();
    expect(identityService.update).toHaveBeenCalledWith("1130000012345678", {
      user_metadata: expect.objectContaining({ email: "new@example.com" }),
    });
  });

  it("rejects a tampered state before spending a code", async () => {
    const [body, signature] = validState().split(".");
    const forged = Buffer.from(
      JSON.stringify({
        cb: "https://evil.example.com/api/yandex-callback",
        tn: null,
        lc: null,
        rt: null,
        n: "n-1",
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
      "utf8",
    ).toString("base64url");

    const result = await makeService().validateCallback(
      { query: { code: "code-1", state: `${forged}.${signature}` } } as any,
      makeIdentityService(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid state \(bad_signature\)/);
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
    expect(body).toBeTruthy();
  });

  it("refuses a callback with no state and one with no code", async () => {
    const noState = await makeService().validateCallback(
      { query: { code: "code-1" } } as any,
      makeIdentityService(),
    );
    expect(noState.success).toBe(false);
    expect(noState.error).toBe("No state provided");

    const noCode = await makeService().validateCallback(
      { query: { state: validState() } } as any,
      makeIdentityService(),
    );
    expect(noCode.success).toBe(false);
    expect(noCode.error).toBe("No code provided");

    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("reports the denied consent screen in Yandex's own words", async () => {
    const result = await makeService().validateCallback(
      { query: { error: "access_denied", error_description: "Пользователь отказал" } } as any,
      makeIdentityService(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Пользователь отказал");
  });

  it("fails readably when the application has no login:email permission", async () => {
    (exchangeCodeForToken as jest.Mock).mockResolvedValue("at-1");
    (fetchYandexProfile as jest.Mock).mockResolvedValue({
      id: "1130000012345678",
      login: "oksana",
    });

    const identityService = makeIdentityService();
    const result = await makeService().validateCallback(
      { query: { code: "code-1", state: validState() } } as any,
      identityService,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/login:email/);
    // No half-made account is left behind.
    expect(identityService.create).not.toHaveBeenCalled();
  });

  it("keeps the secret out of every error it returns and every line it logs", async () => {
    (exchangeCodeForToken as jest.Mock).mockRejectedValue(
      new Error("Yandex token exchange failed: invalid_client"),
    );

    const result = await makeService().validateCallback(
      { query: { code: "code-1", state: validState() } } as any,
      makeIdentityService(),
    );

    expect(result.success).toBe(false);
    expect(result.error).not.toContain(CLIENT_SECRET);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain(CLIENT_SECRET);
      expect(line).not.toContain(STATE_SECRET);
    }
  });

  it("never echoes the attacker-supplied state back into the error", async () => {
    const result = await makeService().validateCallback(
      { query: { code: "code-1", state: "<script>alert(1)</script>" } } as any,
      makeIdentityService(),
    );

    expect(result.success).toBe(false);
    expect(result.error).not.toContain("script");
  });
});
