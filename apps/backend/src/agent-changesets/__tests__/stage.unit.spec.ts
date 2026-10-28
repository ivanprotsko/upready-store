import { isStageSite, stageHostFor, stageHostPrefix, stageOf, stageTenantIdOf } from "../stage";

describe("stage site names (t-2026-10-27-04)", () => {
  const saved = process.env.STAGE_HOST_PREFIX;
  afterEach(() => {
    if (saved === undefined) delete process.env.STAGE_HOST_PREFIX;
    else process.env.STAGE_HOST_PREFIX = saved;
  });

  it("puts the stage site at stage.<main host> by default", () => {
    delete process.env.STAGE_HOST_PREFIX;
    expect(stageHostPrefix()).toBe("stage.");
    expect(stageHostFor("Shop.Example.com")).toBe("stage.shop.example.com");
  });

  it("takes STAGE_HOST_PREFIX, with or without its dot", () => {
    process.env.STAGE_HOST_PREFIX = "preview";
    expect(stageHostFor("shop.ru")).toBe("preview.shop.ru");
    process.env.STAGE_HOST_PREFIX = "Draft.";
    expect(stageHostFor("shop.ru")).toBe("draft.shop.ru");
  });

  it("tells a stage site from a main one by its metadata", () => {
    expect(isStageSite({ stage_of: "tenant_main" })).toBe(true);
    expect(stageOf({ stage_of: "tenant_main" })).toBe("tenant_main");
    expect(isStageSite({ stage_tenant_id: "tenant_stage" })).toBe(false);
    expect(isStageSite(null)).toBe(false);
    expect(isStageSite({ stage_of: "" })).toBe(false);
    expect(stageTenantIdOf({ stage_tenant_id: "tenant_stage" })).toBe("tenant_stage");
  });
});
