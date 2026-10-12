import { PostAdminTenantUpdateSchema } from "../../../api/admin/tenants/validators";
import { isTestShop } from "../test-shop";
import { LIVE_METADATA_KEYS, isLive, readLive } from "../live";

/**
 * t-2026-10-12-31: the tenant's «accepts real visitors» flag. A missing key is
 * not live, only the JSON boolean `true` is, and `test_shop` is a separate
 * question.
 */
describe("isLive", () => {
  it("is false without metadata and without the key", () => {
    expect(isLive(null)).toBe(false);
    expect(isLive(undefined)).toBe(false);
    expect(isLive({})).toBe(false);
    expect(isLive({ test_shop: false })).toBe(false);
  });

  it("is true only for the JSON boolean true", () => {
    expect(isLive({ live: true })).toBe(true);
    expect(isLive({ live: false })).toBe(false);
    expect(isLive({ live: "true" })).toBe(false);
    expect(isLive({ live: 1 })).toBe(false);
    expect(isLive("live")).toBe(false);
  });

  it("is independent of test_shop: a real shop can be not live", () => {
    const realNotLive = { test_shop: false };
    expect(isTestShop(realNotLive)).toBe(false);
    expect(isLive(realNotLive)).toBe(false);

    const fixtureMarkedLive = { test_shop: true, live: true };
    expect(isTestShop(fixtureMarkedLive)).toBe(true);
    expect(isLive(fixtureMarkedLive)).toBe(true);
  });
});

describe("readLive", () => {
  it("reads all three keys", () => {
    expect(readLive({ live: true, live_since: "2026-10-12", live_by: "ivan", test_shop: false })).toEqual({
      live: true,
      live_since: "2026-10-12",
      live_by: "ivan",
    });
  });

  it("gives null for a missing or non-text date and author", () => {
    expect(readLive(null)).toEqual({ live: false, live_since: null, live_by: null });
    expect(readLive({ live: false, live_since: 20261012, live_by: "  " })).toEqual({
      live: false,
      live_since: null,
      live_by: null,
    });
  });
});

describe("POST /admin/tenants/:id refuses the live keys", () => {
  it.each(LIVE_METADATA_KEYS)("refuses metadata.%s, whatever the value", (key) => {
    for (const value of [true, false, "", null, "2026-10-12", "ivan"]) {
      const parsed = PostAdminTenantUpdateSchema.safeParse({ metadata: { [key]: value } });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0].message).toMatch(/deploy\/scripts\/tenant-live\.mjs/);
    }
  });

  it("still takes other metadata keys and a name", () => {
    expect(PostAdminTenantUpdateSchema.safeParse({ name: "Shop", metadata: { test_shop: true } }).success).toBe(true);
  });
});
