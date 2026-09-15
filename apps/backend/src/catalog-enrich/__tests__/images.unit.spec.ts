import { keyFromCatalogImage, keyFromWbUrl, photoKey, planPhotos } from "../images";

/**
 * The gallery half of w07-tenant-catalog-enrich: the cover must not move and a
 * photo the catalog already carries must not be appended twice.
 */

const WB = (nmId: string, index: number) =>
  `https://basket-05.wbbasket.ru/vol943/part94372/${nmId}/images/big/${index}.webp`;

describe("catalog-enrich/images — keys", () => {
  it("reads the card and the position out of a WB photo URL", () => {
    expect(keyFromWbUrl(WB("94372564", 3))).toBe("wb:94372564:3");
    expect(
      keyFromWbUrl("https://basket-15.wbbasket.ru/vol2197/part219762/219762882/images/c516x688/1.webp"),
    ).toBe("wb:219762882:1");
  });

  it("gives null for anything that is not a WB photo URL", () => {
    expect(keyFromWbUrl("https://example.com/photo.webp")).toBeNull();
    expect(keyFromWbUrl(null)).toBeNull();
  });

  it("recognises a photo this script added, from its own metadata", () => {
    expect(
      keyFromCatalogImage({
        url: "http://localhost:9077/static/tenants/ten_1/1789-94372564__2.webp",
        metadata: { wb_source_url: WB("94372564", 2) },
      }),
    ).toBe("wb:94372564:2");
  });

  it("recognises a photo the 2026-09-12 migration downloaded, from its file name", () => {
    expect(
      keyFromCatalogImage({
        url: "http://localhost:9077/static/tenants/ten_1/1789180156900-140764924__1.webp",
        metadata: null,
      }),
    ).toBe("wb:140764924:1");
  });

  it("does not read a plain upload as a WB photo", () => {
    expect(
      keyFromCatalogImage({ url: "http://localhost:9077/static/tenants/ten_1/1789180154683-28.png" }),
    ).toBeNull();
  });
});

describe("catalog-enrich/images — planPhotos", () => {
  const existing = [
    { url: "http://stand/static/tenants/t/1789-28.png" },
    { url: "http://stand/static/tenants/t/1789-94372564__1.webp" },
    { url: "http://stand/static/tenants/t/1789-94372564__2.webp" },
  ];

  it("appends only what the product does not already carry", () => {
    const plan = planPhotos(existing, [
      { index: 1, url: WB("94372564", 1) },
      { index: 2, url: WB("94372564", 2) },
      { index: 3, url: WB("94372564", 3) },
    ]);

    expect(plan.skipped.map((one) => one.key)).toEqual(["wb:94372564:1", "wb:94372564:2"]);
    expect(plan.append.map((one) => one.key)).toEqual([photoKey("94372564", 3)]);
  });

  it("is idempotent: a second run over the result appends nothing", () => {
    const photos = [1, 2, 3].map((index) => ({ index, url: WB("94372564", index) }));
    const first = planPhotos(existing, photos);

    const after = [
      ...existing,
      ...first.append.map((one) => ({
        url: "http://stand/static/tenants/t/whatever.webp",
        metadata: { wb_source_url: one.url },
      })),
    ];

    expect(planPhotos(after, photos).append).toHaveLength(0);
  });

  it("never proposes to remove or reorder an existing image", () => {
    const plan = planPhotos(existing, [{ index: 9, url: WB("94372564", 9) }]);

    // The plan is append-only by construction: it has no other field.
    expect(Object.keys(plan).sort()).toEqual(["append", "skipped"]);
    expect(plan.append).toHaveLength(1);
  });

  it("does not append the same photo twice inside one card", () => {
    const plan = planPhotos([], [
      { index: 1, url: WB("94372564", 1) },
      { index: 1, url: WB("94372564", 1) },
    ]);

    expect(plan.append).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
  });
});
