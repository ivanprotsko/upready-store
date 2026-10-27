import { afterOf, changedFields } from "../diff";

describe("agent changeset diff (t-2026-10-27-04)", () => {
  it("lays a page op's body over what was there, without locale", () => {
    const after = afterOf(
      "page",
      { method: "PUT", path: "/tenants/pages/about", body: { title: "Новое", locale: "ru" } },
      { title: "Старое", body: "текст" },
    );
    expect(after).toEqual({ title: "Новое", body: "текст" });
    expect(changedFields({ title: "Старое", body: "текст" }, after)).toEqual([
      { field: "title", before: "Старое", after: "Новое" },
    ]);
  });

  it("shows a new page against nothing", () => {
    const after = afterOf("page-create", { method: "POST", path: "/tenants/pages", body: { slug: "sale", title: "Sale" } }, null);
    expect(changedFields(null, after)).toEqual([{ field: "title", before: null, after: "Sale" }]);
  });

  it("shows prices and characteristics in the snapshot's shape", () => {
    expect(
      afterOf(
        "variant",
        { method: "POST", path: "/tenants/products/p/variants/v", body: { prices: [{ amount: 500, currency_code: "RUB" }] } },
        { prices: [{ amount: 900, currency_code: "rub" }] },
      ),
    ).toEqual({ prices: [{ amount: 500, currency_code: "rub" }] });
    expect(
      afterOf(
        "attributes",
        { method: "POST", path: "/tenants/products/p/attributes", body: { values: [{ key: "taste", value: null }] } },
        { taste: "sweet" },
      ),
    ).toEqual({ taste: null });
  });

  it("finds no change where nothing changes", () => {
    expect(changedFields({ a: 1, b: [1] }, { b: [1], a: 1 })).toEqual([]);
  });
});
