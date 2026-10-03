import {
  ATTRIBUTION_FALLBACK,
  isAttributionHidden,
  parseAttributionGroups,
  resolveAttribution,
} from "../attribution";

const GROUPS = {
  "ru-core": { anchor: "интернет-магазин под ключ" },
  studio: { anchor: "разработка интернет-магазина", href: "https://upready.dev/studio" },
};

describe("resolveAttribution", () => {
  it("gives a shop that configures nothing the platform's own line", () => {
    expect(resolveAttribution(null, GROUPS)).toEqual(ATTRIBUTION_FALLBACK);
  });

  it("hands a group's anchor to every shop in it", () => {
    expect(resolveAttribution({ attribution_group: "ru-core" }, GROUPS)).toEqual({
      ...ATTRIBUTION_FALLBACK,
      anchor: "интернет-магазин под ключ",
    });
  });

  it("lets one shop override the anchor alone and inherit the rest of its group", () => {
    const resolved = resolveAttribution(
      { attribution_group: "studio", attribution: { anchor: "сайт магазина" } },
      GROUPS,
    );

    expect(resolved.anchor).toBe("сайт магазина");
    expect(resolved.href).toBe("https://upready.dev/studio");
    expect(resolved.brand).toBe(ATTRIBUTION_FALLBACK.brand);
  });

  it("ignores a group nobody defined instead of blanking the footer", () => {
    expect(resolveAttribution({ attribution_group: "gone" }, GROUPS)).toEqual(
      ATTRIBUTION_FALLBACK,
    );
  });

  it("ignores junk in metadata, because a footer still has to render", () => {
    expect(
      resolveAttribution(
        { attribution: { anchor: "   ", href: 42, colour: "red" } } as Record<
          string,
          unknown
        >,
        GROUPS,
      ),
    ).toEqual(ATTRIBUTION_FALLBACK);
  });
});

describe("parseAttributionGroups", () => {
  it("reads the configured groups", () => {
    expect(
      parseAttributionGroups('{"ru-core":{"anchor":"интернет-магазин под ключ"}}'),
    ).toEqual({ "ru-core": { anchor: "интернет-магазин под ключ" } });
  });

  it("reports broken JSON once and resolves no group, rather than throwing", () => {
    const said: string[] = [];

    expect(parseAttributionGroups("{not json", (m) => said.push(m))).toEqual({});
    expect(said).toHaveLength(1);
  });

  it("is empty when the variable is unset", () => {
    expect(parseAttributionGroups(undefined)).toEqual({});
  });
});

describe("isAttributionHidden", () => {
  it("switches the line off only on an explicit attribution_hidden", () => {
    expect(isAttributionHidden({ attribution_hidden: true })).toBe(true);
    expect(isAttributionHidden({ attribution_hidden: "true" })).toBe(true);
    expect(isAttributionHidden({ attribution_hidden: false })).toBe(false);
    expect(isAttributionHidden({ attribution: { anchor: "" } })).toBe(false);
    expect(isAttributionHidden(null)).toBe(false);
  });
});
