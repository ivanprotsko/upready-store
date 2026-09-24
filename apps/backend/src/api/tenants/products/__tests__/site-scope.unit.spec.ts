import { channelsForSiteScope, SiteScopeSchema, siteScopeOf } from "../site-scope";

/**
 * t-2026-09-24-n12: `site_scope` is read off and written to the product's own
 * sales channels, against the sites of the caller's group.
 */
describe("site scope", () => {
  const sites = [
    { tenant_id: "ten_a", sales_channel_id: "sc_a" },
    { tenant_id: "ten_b", sales_channel_id: "sc_b" },
    { tenant_id: "ten_c", sales_channel_id: "sc_c" },
  ];

  describe("siteScopeOf", () => {
    it("reads 'all' when the product is in every site's channel", () => {
      expect(siteScopeOf(["sc_c", "sc_a", "sc_b", "sc_other"], sites)).toBe("all");
    });

    it("reads the subset otherwise, in site order", () => {
      expect(siteScopeOf(["sc_c", "sc_a"], sites)).toEqual({ tenant_ids: ["ten_a", "ten_c"] });
      expect(siteScopeOf([], sites)).toEqual({ tenant_ids: [] });
    });

    it("a shop without a group is 'all' when the product is in its channel", () => {
      expect(siteScopeOf(["sc_a"], [sites[0]])).toBe("all");
    });
  });

  describe("channelsForSiteScope", () => {
    it("'all' adds every site's channel and keeps channels outside the group", () => {
      expect(channelsForSiteScope("all", sites, ["sc_other", "sc_a"]).sort()).toEqual(
        ["sc_a", "sc_b", "sc_c", "sc_other"].sort(),
      );
    });

    it("a subset removes the group channels it does not name", () => {
      expect(channelsForSiteScope({ tenant_ids: ["ten_b"] }, sites, ["sc_a", "sc_b", "sc_c", "sc_other"]).sort()).toEqual(
        ["sc_b", "sc_other"],
      );
    });

    it("refuses a site outside the group", () => {
      expect(() => channelsForSiteScope({ tenant_ids: ["ten_foreign"] }, sites, [])).toThrow(
        'Site "ten_foreign" was not found.',
      );
    });

    it("skips a site whose channel is gone", () => {
      const withGone = [...sites, { tenant_id: "ten_d", sales_channel_id: null }];
      expect(channelsForSiteScope("all", withGone, [])).toEqual(["sc_a", "sc_b", "sc_c"]);
    });
  });

  describe("SiteScopeSchema", () => {
    it("accepts 'all' and a non-empty tenant list only", () => {
      expect(SiteScopeSchema.safeParse("all").success).toBe(true);
      expect(SiteScopeSchema.safeParse({ tenant_ids: ["ten_a"] }).success).toBe(true);
      expect(SiteScopeSchema.safeParse({ tenant_ids: [] }).success).toBe(false);
      expect(SiteScopeSchema.safeParse("some").success).toBe(false);
      expect(SiteScopeSchema.safeParse({ tenant_ids: ["ten_a"], extra: 1 }).success).toBe(false);
    });
  });
});
