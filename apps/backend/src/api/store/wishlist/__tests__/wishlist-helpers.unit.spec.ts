import {
  sortWishlistNewestFirst,
  toWishlistItemDto,
  type WishlistItemRow,
  type WishlistProductSummary,
} from "../wishlist-helpers";

const row = (overrides: Partial<WishlistItemRow> & { id: string }): WishlistItemRow => ({
  tenant_id: "ten_1",
  customer_id: "cus_1",
  product_id: "prod_1",
  created_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const product = (overrides: Partial<WishlistProductSummary> & { id: string }): WishlistProductSummary => ({
  title: "Товар",
  handle: "tovar",
  thumbnail: null,
  variant_ids: ["variant_1"],
  ...overrides,
});

describe("sortWishlistNewestFirst", () => {
  it("puts the most recently saved item first", () => {
    const older = row({ id: "wish_1", created_at: "2026-01-01T00:00:00.000Z" });
    const newer = row({ id: "wish_2", created_at: "2026-02-01T00:00:00.000Z" });

    expect(sortWishlistNewestFirst([older, newer])).toEqual([newer, older]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ id: "wish_1", created_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "wish_2", created_at: "2026-02-01T00:00:00.000Z" }),
    ];
    const original = [...rows];

    sortWishlistNewestFirst(rows);

    expect(rows).toEqual(original);
  });
});

describe("toWishlistItemDto", () => {
  it("attaches the product when it is still on the shop", () => {
    const productsById = new Map([["prod_1", product({ id: "prod_1" })]]);

    expect(toWishlistItemDto(row({ id: "wish_1" }), productsById)).toEqual({
      product_id: "prod_1",
      created_at: "2026-01-01T00:00:00.000Z",
      product: product({ id: "prod_1" }),
    });
  });

  it("answers null, never throws, when the product is gone (rule 20a)", () => {
    expect(toWishlistItemDto(row({ id: "wish_1" }), new Map())).toEqual({
      product_id: "prod_1",
      created_at: "2026-01-01T00:00:00.000Z",
      product: null,
    });
  });
});
