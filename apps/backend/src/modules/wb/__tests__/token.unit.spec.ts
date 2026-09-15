import { inspectToken, maskBits, readOnlyWarning, WB_READ_ONLY_BIT } from "../token";

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
});
