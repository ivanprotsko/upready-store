import { mergeSwitchableShops } from "../group-sites";

/**
 * t-2026-09-24-n12: the switcher list is the email's own shops plus the other
 * sites of the current client, one entry per tenant, with the test-shop rule
 * of o25-hide-test-shops applied to both sources.
 */
describe("mergeSwitchableShops", () => {
  const shop = (id: string, metadata: Record<string, unknown> | null = null) => ({
    id,
    name: `Shop ${id}`,
    handle: `handle-${id}`,
    metadata,
  });

  it("without a group returns exactly the email's shops", () => {
    expect(mergeSwitchableShops("a", [shop("a"), shop("b")], [])).toEqual([
      { id: "a", name: "Shop a", handle: "handle-a" },
      { id: "b", name: "Shop b", handle: "handle-b" },
    ]);
  });

  it("adds the group's sites once, even when the email already holds a row there", () => {
    const ids = mergeSwitchableShops("a", [shop("a"), shop("b")], [shop("a"), shop("b"), shop("c")]).map(
      (s) => s.id,
    );
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("hides a test shop from either source unless it is the current one", () => {
    const ids = mergeSwitchableShops(
      "a",
      [shop("a", { test_shop: true }), shop("b", { test_shop: true })],
      [shop("c", { test_shop: true }), shop("d")],
    ).map((s) => s.id);
    expect(ids).toEqual(["a", "d"]);
  });

  it("skips rows with no tenant", () => {
    expect(mergeSwitchableShops("a", [{}, shop("a")], [])).toHaveLength(1);
  });
});
