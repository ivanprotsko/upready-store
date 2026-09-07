import path from "node:path";
import { deepMerge, resolveProfileDir, toMediaUrl } from "../data/store-profile";

const FIXTURE_DIR = path.join(__dirname, "fixtures", "profiles", "fixture-shop");
const BASE_URL = "http://localhost:9023/static/store-profiles/fixture-shop";

describe("resolveProfileDir", () => {
  it("returns null when STORE_PROFILE is unset, empty or blank", () => {
    expect(resolveProfileDir({})).toBeNull();
    expect(resolveProfileDir({ STORE_PROFILE: "" })).toBeNull();
    expect(resolveProfileDir({ STORE_PROFILE: "   " })).toBeNull();
  });

  it("resolves an id against the profiles directory", () => {
    expect(() => resolveProfileDir({ STORE_PROFILE: "no-such-profile" })).toThrow(
      /points at .*data\/profiles\/no-such-profile.*does not exist/s,
    );
  });

  it("honours STORE_PROFILE_DIR as the directory override", () => {
    expect(
      resolveProfileDir({
        STORE_PROFILE: "fixture-shop",
        STORE_PROFILE_DIR: FIXTURE_DIR,
      }),
    ).toEqual({ id: "fixture-shop", dir: FIXTURE_DIR });
  });
});

describe("toMediaUrl", () => {
  it("prefixes STORE_MEDIA_BASE_URL and drops the media/ segment", () => {
    expect(toMediaUrl("media/fixture-runner-hero.webp", BASE_URL)).toBe(
      `${BASE_URL}/fixture-runner-hero.webp`,
    );
  });

  it("tolerates a trailing slash on the base URL", () => {
    expect(toMediaUrl("media/a.webp", `${BASE_URL}/`)).toBe(`${BASE_URL}/a.webp`);
  });

  it("rejects an absolute URL instead of passing it through", () => {
    for (const absolute of [
      "https://replicate.delivery/pbxt/abc.webp",
      "http://example.com/a.webp",
      "//cdn.example.com/a.webp",
    ]) {
      expect(() => toMediaUrl(absolute, BASE_URL)).toThrow(
        /is an absolute URL/,
      );
    }
  });

  it("rejects a ref that is not a media ref", () => {
    expect(() => toMediaUrl("images/a.webp", BASE_URL)).toThrow(
      /is not a media ref/,
    );
    expect(() => toMediaUrl("media/a.gif", BASE_URL)).toThrow(
      /is not a media ref/,
    );
  });

  it("refuses to build a URL without a base", () => {
    expect(() => toMediaUrl("media/a.webp", "")).toThrow(
      /STORE_MEDIA_BASE_URL is not set/,
    );
  });
});

describe("deepMerge", () => {
  it("lets the override win key by key and keeps the rest of the base", () => {
    expect(
      deepMerge(
        { a: { x: 1, y: 2 }, b: 3 },
        { a: { y: 20, z: 30 } },
      ),
    ).toEqual({ a: { x: 1, y: 20, z: 30 }, b: 3 });
  });

  it("replaces arrays and scalars wholesale", () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] });
    expect(deepMerge({ a: { x: 1 } }, { a: "flat" })).toEqual({ a: "flat" });
  });

  it("keeps the base when the override is undefined", () => {
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
  });
});
