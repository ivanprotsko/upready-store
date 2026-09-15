import {
  inspectToken,
  maskBits,
  readOnlyWarning,
  tokenCategories,
  WB_EXPIRY_WARNING_DAYS,
  WB_READ_ONLY_BIT,
} from "../token";

/**
 * What the key says about itself (w01-wb-readonly-client).
 *
 * The bit meanings come from WB's own "Bit values" table, not from memory
 * (rule 17a): https://dev.wildberries.ru/en/docs/openapi/api-information#tag/authorization/About-the-token
 *
 * The case that matters most is the third one: a payload without a readable
 * `s` reports `"unknown"`, never `true`. A key we cannot read is not a key we
 * may call read-only.
 */

const jwtWith = (payload: Record<string, unknown>): string =>
  [
    Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature-is-never-verified-here",
  ].join(".");

/** The mask Oksana's key actually carries, measured 2026-09-16 03:50 WITA. */
const LIVE_MASK = 1_073_742_014;

describe("inspectToken", () => {
  it("reads the documented fields of a live-shaped key", () => {
    const facts = inspectToken(
      jwtWith({
        acc: 1,
        t: false,
        exp: 1_805_260_802,
        id: "01a0a615-3216-76ae-bd13-b95330f7a589",
        sid: "7b3bb9b2-d911-4b59-9c9b-1a780b11b91a",
        oid: 532_582,
        s: LIVE_MASK,
      }),
    );

    expect(facts.kind).toBe("base");
    expect(facts.sandbox).toBe(false);
    expect(facts.expiresAt).toBe("2027-03-17T05:20:02.000Z");
    expect(facts.expired).toBe(false);
    expect(facts.mask).toBe(LIVE_MASK);
    expect(facts.readOnly).toBe(true);
    expect(facts.error).toBeNull();
    expect(facts.docUrl).toMatch(/dev\.wildberries\.ru/);
  });

  it("names the bits the documentation names", () => {
    const bits = maskBits(LIVE_MASK);

    expect(bits.map((item) => item.bit)).toEqual([1, 2, 3, 4, 5, 7, 30]);
    expect(bits.find((item) => item.bit === 1)?.meaning).toBe("Access to Content");
    expect(bits.find((item) => item.bit === 30)?.meaning).toBe("Read only token");
  });

  it("reports readOnly false when bit 30 is clear, rather than assuming", () => {
    const facts = inspectToken(jwtWith({ acc: 1, t: false, exp: 2_000_000_000, s: 30 }));

    expect(facts.mask).toBe(30);
    expect(facts.readOnly).toBe(false);
    expect(readOnlyWarning(facts)).toContain(`read-only bit (${WB_READ_ONLY_BIT}) is NOT set`);
  });

  it("reports unknown, never true, when the mask cannot be read", () => {
    const facts = inspectToken(jwtWith({ acc: 1, exp: 2_000_000_000 }));

    expect(facts.readOnly).toBe("unknown");
    expect(facts.error).toMatch(/no numeric/);
    expect(readOnlyWarning(facts)).toContain("could not be read");
  });

  it.each([
    ["no key at all", null],
    ["a key that is not a JWT", "not-a-jwt"],
    ["a JWT whose payload is not JSON", "a.bm90LWpzb24.c"],
  ])("does not throw on %s", (_label, key) => {
    const facts = inspectToken(key as string | null);

    expect(facts.readOnly).toBe("unknown");
    expect(facts.error).not.toBeNull();
  });

  it("says nothing when the key is marked read-only", () => {
    const facts = inspectToken(jwtWith({ acc: 1, exp: 2_000_000_000, s: LIVE_MASK }));

    expect(readOnlyWarning(facts)).toBeNull();
  });

  it("marks an expired key as expired", () => {
    const facts = inspectToken(jwtWith({ acc: 1, exp: 1_000_000_000, s: LIVE_MASK }));

    expect(facts.expired).toBe(true);
  });

  it("names an unnamed bit as unknown rather than dropping it (w13-wb-readonly-flag)", () => {
    // Bit 8 is absent from the doc's "Bit values" table (rule text lists 1-7,
    // 9-13, 16, 30 only), so it must surface with meaning: null, not vanish.
    const bits = maskBits((1 << 8) | (1 << 1));

    expect(bits.map((item) => item.bit)).toEqual([1, 8]);
    expect(bits.find((item) => item.bit === 8)?.meaning).toBeNull();
  });

  it("lists every documented category, granted and denied (w13-wb-readonly-flag)", () => {
    const categories = tokenCategories(LIVE_MASK);

    expect(categories.find((c) => c.bit === 1)).toEqual({
      bit: 1,
      name: "Access to Content",
      granted: true,
    });
    expect(categories.find((c) => c.bit === 10)).toEqual({
      bit: 10,
      name: "Access to Supplies",
      granted: false,
    });
    // Bit 30 (read-only) is the flag itself, not a category.
    expect(categories.some((c) => c.bit === WB_READ_ONLY_BIT)).toBe(false);
  });

  it("grants nothing when the mask cannot be read", () => {
    const categories = tokenCategories(null);

    expect(categories.every((c) => c.granted === false)).toBe(true);
  });

  it(`flags a key expiring within ${WB_EXPIRY_WARNING_DAYS} days as expiringSoon`, () => {
    const soon = inspectToken(
      jwtWith({ acc: 1, exp: Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60, s: LIVE_MASK }),
    );
    const later = inspectToken(
      jwtWith({ acc: 1, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, s: LIVE_MASK }),
    );
    const expired = inspectToken(jwtWith({ acc: 1, exp: 1_000_000_000, s: LIVE_MASK }));

    expect(soon.expiringSoon).toBe(true);
    expect(soon.expiresInDays).toBeLessThan(WB_EXPIRY_WARNING_DAYS);
    expect(later.expiringSoon).toBe(false);
    // An already-expired key needs the "expired" state, not "expiring soon".
    expect(expired.expiringSoon).toBe(false);
  });

  it("names the granted categories in the boot warning when the key is not read-only", () => {
    const facts = inspectToken(jwtWith({ acc: 1, t: false, exp: 2_000_000_000, s: 1 << 1 }));

    expect(readOnlyWarning(facts)).toContain("The key also grants: Access to Content.");
  });
});
