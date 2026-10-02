import { createHash, createHmac } from "node:crypto";
import { verifyInitData, verifyLoginWidget } from "../verify";

const BOT_TOKEN = "123456:AAAA-fake-token-for-tests";

/** Signs a Login Widget payload the way Telegram itself does, for test fixtures only. */
const signWidget = (fields: Record<string, string>): Record<string, string> => {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHash("sha256").update(BOT_TOKEN, "utf8").digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  return { ...fields, hash };
};

/** Signs an initData query string the way Telegram's Mini App platform does. */
const signInitData = (fields: Record<string, string>): string => {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN, "utf8").digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
};

describe("verifyLoginWidget", () => {
  const now = Math.floor(Date.now() / 1000);
  const validFields = {
    id: "42",
    first_name: "Oksana",
    username: "cherkashinao",
    auth_date: String(now),
  };

  it("accepts a correctly signed, fresh payload", () => {
    const result = verifyLoginWidget(signWidget(validFields), BOT_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual({
        id: 42,
        first_name: "Oksana",
        last_name: undefined,
        username: "cherkashinao",
        photo_url: undefined,
      });
    }
  });

  it("rejects a tampered field (hash no longer matches)", () => {
    const signed = signWidget(validFields);
    const tampered = { ...signed, id: "999" };
    const result = verifyLoginWidget(tampered, BOT_TOKEN);
    expect(result).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects a tampered hash directly", () => {
    const signed = signWidget(validFields);
    const tampered = { ...signed, hash: `${signed.hash.slice(0, -1)}${signed.hash.endsWith("a") ? "b" : "a"}` };
    const result = verifyLoginWidget(tampered, BOT_TOKEN);
    expect(result).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects a payload signed with a different bot token", () => {
    const signed = signWidget(validFields);
    const result = verifyLoginWidget(signed, "999999:another-bot-token");
    expect(result).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects a stale auth_date outside the freshness bound", () => {
    const stale = { ...validFields, auth_date: String(now - 100_000) };
    const result = verifyLoginWidget(signWidget(stale), BOT_TOKEN, { maxAgeSec: 86_400 });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts a stale auth_date when the freshness bound is disabled", () => {
    const stale = { ...validFields, auth_date: String(now - 100_000) };
    const result = verifyLoginWidget(signWidget(stale), BOT_TOKEN, { maxAgeSec: 0 });
    expect(result.ok).toBe(true);
  });

  it("rejects an empty bot token (the chrxnasdmds b553c540/d87bd117 lesson: falsy, not just undefined)", () => {
    const result = verifyLoginWidget(signWidget(validFields), "");
    expect(result).toEqual({ ok: false, reason: "missing_input" });
  });

  it("rejects a payload with no hash at all", () => {
    const result = verifyLoginWidget(validFields, BOT_TOKEN);
    expect(result).toEqual({ ok: false, reason: "no_hash" });
  });
});

describe("verifyInitData", () => {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: 42, first_name: "Oksana", username: "cherkashinao" };
  const validFields = {
    query_id: "AAE-fake",
    user: JSON.stringify(user),
    auth_date: String(now),
  };

  it("accepts a correctly signed, fresh initData string", () => {
    const result = verifyInitData(signInitData(validFields), BOT_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual(user);
    }
  });

  it("rejects a tampered user field", () => {
    const signed = signInitData(validFields);
    const params = new URLSearchParams(signed);
    params.set("user", JSON.stringify({ ...user, id: 999 }));
    const result = verifyInitData(params.toString(), BOT_TOKEN);
    expect(result).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects a stale auth_date outside the freshness bound", () => {
    const stale = { ...validFields, auth_date: String(now - 100_000) };
    const result = verifyInitData(signInitData(stale), BOT_TOKEN, { maxAgeSec: 3_600 });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects initData signed with the WRONG algorithm (plain SHA256(token) instead of HMAC(\"WebAppData\", token))", () => {
    // The widget's secret derivation, used by mistake on an initData payload:
    // must fail, proving the two surfaces are not interchangeable.
    const checkString = Object.keys(validFields)
      .sort()
      .map((key) => `${key}=${(validFields as Record<string, string>)[key]}`)
      .join("\n");
    const wrongSecret = createHash("sha256").update(BOT_TOKEN, "utf8").digest();
    const wrongHash = createHmac("sha256", wrongSecret).update(checkString).digest("hex");
    const params = new URLSearchParams({ ...validFields, hash: wrongHash });
    const result = verifyInitData(params.toString(), BOT_TOKEN);
    expect(result).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects missing initData", () => {
    const result = verifyInitData("", BOT_TOKEN);
    expect(result).toEqual({ ok: false, reason: "missing_input" });
  });

  it("rejects an unparseable user field", () => {
    const fields = { ...validFields, user: "{not-json" };
    const result = verifyInitData(signInitData(fields), BOT_TOKEN);
    expect(result).toEqual({ ok: false, reason: "bad_user" });
  });
});
