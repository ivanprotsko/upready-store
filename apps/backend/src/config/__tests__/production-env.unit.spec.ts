import {
  assertProductionEnv,
  cookieSecure,
  missingProductionEnv,
  REQUIRED_IN_PRODUCTION,
} from "../production-env";

const full = Object.fromEntries(REQUIRED_IN_PRODUCTION.map((name) => [name, `value-of-${name}`]));

describe("production env guard (audit A-06/C-02)", () => {
  it("throws in production and names every missing variable", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "production" })).toThrow(
      "JWT_SECRET, COOKIE_SECRET, STORE_CORS, ADMIN_CORS, AUTH_CORS",
    );
  });

  it("treats an empty value (compose `${X}` with X unset) as missing", () => {
    expect(missingProductionEnv({ ...full, NODE_ENV: "production", COOKIE_SECRET: "" })).toEqual([
      "COOKIE_SECRET",
    ]);
  });

  it("passes in production when everything is set", () => {
    expect(() => assertProductionEnv({ ...full, NODE_ENV: "production" })).not.toThrow();
  });

  it("keeps the dev defaults outside production", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: "test" })).not.toThrow();
    expect(() => assertProductionEnv({})).not.toThrow();
  });
});

describe("cookieSecure (audit A-03)", () => {
  it("is on in production by default", () => {
    expect(cookieSecure({ NODE_ENV: "production" })).toBe(true);
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "true" })).toBe(true);
  });

  it("is off in production only on an explicit COOKIE_SECURE=false", () => {
    expect(cookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "false" })).toBe(false);
  });

  it("is off outside production whatever COOKIE_SECURE says", () => {
    expect(cookieSecure({ NODE_ENV: "development" })).toBe(false);
    expect(cookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "true" })).toBe(false);
  });
});

describe("order access token secret (audit A-06)", () => {
  // Imported here rather than at the top so a failure in one module does not
  // hide the other's cases.
  const { accessSecret } = require("../../store-order-access/token");

  it("throws in production when neither secret is set", () => {
    expect(() => accessSecret({ NODE_ENV: "production" })).toThrow("ORDER_ACCESS_SECRET");
  });

  it("prefers ORDER_ACCESS_SECRET, then JWT_SECRET", () => {
    expect(accessSecret({ NODE_ENV: "production", ORDER_ACCESS_SECRET: "a", JWT_SECRET: "b" })).toBe("a");
    expect(accessSecret({ NODE_ENV: "production", JWT_SECRET: "b" })).toBe("b");
  });

  it("keeps the dev default outside production", () => {
    expect(accessSecret({ NODE_ENV: "development" })).toBe("supersecret");
  });
});
