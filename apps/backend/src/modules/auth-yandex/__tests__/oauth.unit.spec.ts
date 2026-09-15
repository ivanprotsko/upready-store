import {
  YANDEX_AUTHORIZE_URL,
  avatarUrl,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchYandexProfile,
  mapProfileToIdentity,
  resolveProfileEmail,
} from "../lib/oauth";

const CLIENT_SECRET = "s3cr3t-never-in-a-message";

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Bad Request",
    json: async () => body,
  }) as unknown as Response;

describe("auth-yandex authorize URL", () => {
  it("carries the five parameters of the code flow", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client-123",
        redirectUri: "https://cherkashino.ru/api/yandex-callback",
        state: "signed.state",
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe(YANDEX_AUTHORIZE_URL);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://cherkashino.ru/api/yandex-callback",
    );
    expect(url.searchParams.get("state")).toBe("signed.state");
    // Not requested unless the flow narrows the application's permissions.
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.has("force_confirm")).toBe(false);
  });

  it("adds scope and force_confirm only when asked", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client-123",
        redirectUri: "https://cherkashino.ru/api/yandex-callback",
        state: "signed.state",
        scope: "login:email login:info",
        forceConfirm: true,
      }),
    );

    expect(url.searchParams.get("scope")).toBe("login:email login:info");
    expect(url.searchParams.get("force_confirm")).toBe("yes");
  });
});

describe("auth-yandex profile mapping", () => {
  it("builds the identity from a full profile", () => {
    const identity = mapProfileToIdentity({
      id: "1130000012345678",
      login: "oksana",
      first_name: "Оксана",
      last_name: "Черкашина",
      real_name: "Оксана Черкашина",
      default_email: "Oksana@Example.COM",
      emails: ["oksana@example.com"],
      default_avatar_id: "abc123",
      is_avatar_empty: false,
    });

    expect(identity.entityId).toBe("1130000012345678");
    expect(identity.userMetadata.email).toBe("oksana@example.com");
    expect(identity.userMetadata.name).toBe("Оксана Черкашина");
    expect(identity.userMetadata.first_name).toBe("Оксана");
    expect(identity.userMetadata.picture).toBe(
      "https://avatars.yandex.net/get-yapic/abc123/islands-200",
    );
  });

  it("falls back to emails[] and to the name parts", () => {
    const identity = mapProfileToIdentity({
      id: "42",
      first_name: "Ivan",
      last_name: "Protsko",
      emails: ["  Ivan@Example.com "],
    });

    expect(identity.userMetadata.email).toBe("ivan@example.com");
    expect(identity.userMetadata.name).toBe("Ivan Protsko");
    expect(identity.userMetadata.picture).toBeNull();
  });

  it("treats an empty avatar as no avatar", () => {
    expect(avatarUrl({ default_avatar_id: "x", is_avatar_empty: true })).toBeNull();
    expect(avatarUrl({})).toBeNull();
  });

  it("names the missing permission when the profile has no email", () => {
    // An application registered without `login:email` answers with a profile
    // that carries an id and a login and nothing to create a customer with.
    expect(() => mapProfileToIdentity({ id: "42", login: "oksana" })).toThrow(
      /login:email/,
    );
    expect(resolveProfileEmail({ id: "42" })).toBeNull();
  });

  it("refuses a profile with no id", () => {
    expect(() =>
      mapProfileToIdentity({ default_email: "a@b.c" }),
    ).toThrow(/missing 'id'/);
  });
});

describe("auth-yandex token exchange", () => {
  it("posts the credentials in the body and returns the access token", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return jsonResponse(200, { access_token: "at-1", expires_in: 3600 });
    }) as unknown as typeof fetch;

    const token = await exchangeCodeForToken({
      code: "code-1",
      clientId: "client-123",
      clientSecret: CLIENT_SECRET,
      redirectUri: "https://cherkashino.ru/api/yandex-callback",
      fetchImpl,
    });

    expect(token).toBe("at-1");
    expect(seen!.url).toBe("https://oauth.yandex.ru/token");
    expect(seen!.init.method).toBe("POST");

    const body = new URLSearchParams(seen!.init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("client_secret")).toBe(CLIENT_SECRET);
    expect(body.get("redirect_uri")).toBe(
      "https://cherkashino.ru/api/yandex-callback",
    );
    // The secret must never travel in a URL, where an access log would keep it.
    expect(seen!.url).not.toContain(CLIENT_SECRET);
  });

  it("reports Yandex's own reason and never the secret", async () => {
    const fetchImpl = (async () =>
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "Code has expired",
      })) as unknown as typeof fetch;

    await expect(
      exchangeCodeForToken({
        code: "code-1",
        clientId: "client-123",
        clientSecret: CLIENT_SECRET,
        fetchImpl,
      }),
    ).rejects.toThrow(/Code has expired/);

    await exchangeCodeForToken({
      code: "code-1",
      clientId: "client-123",
      clientSecret: CLIENT_SECRET,
      fetchImpl,
    }).catch((error: Error) => {
      expect(error.message).not.toContain(CLIENT_SECRET);
    });
  });
});

describe("auth-yandex profile request", () => {
  it("uses the OAuth authorization scheme, not Bearer", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return jsonResponse(200, { id: "42", default_email: "a@b.c" });
    }) as unknown as typeof fetch;

    const profile = await fetchYandexProfile({
      accessToken: "at-1",
      fetchImpl,
    });

    expect(profile.id).toBe("42");
    expect(seen!.url).toBe("https://login.yandex.ru/info?format=json");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(
      "OAuth at-1",
    );
  });

  it("throws on a non-2xx answer", async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({}),
      }) as unknown as Response) as unknown as typeof fetch;

    await expect(
      fetchYandexProfile({ accessToken: "at-1", fetchImpl }),
    ).rejects.toThrow(/401/);
  });
});
