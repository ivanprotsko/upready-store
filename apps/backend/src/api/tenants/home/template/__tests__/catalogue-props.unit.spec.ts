import type * as ApplyModule from "../apply";
import type * as ValidationModule from "../validation";

/**
 * Props of a block the backend has no check for (t-2026-10-12-33): a block PR adds its
 * parser on the storefront only, and the backend takes that block's props from its catalogue
 * template and nothing else. The real catalogue may hold no such block yet, so these cases
 * run on a fixture catalogue: the exported one plus a `test/unchecked` block with props and
 * no `PROPS_CHECKS` line, placed last in a copy of `long-morning`.
 */

const UNCHECKED = "test/unchecked";
const OWN_PROPS = { title: { ru: "Наша история", en: "Our story" }, items: [{ ru: "Раз" }, { ru: "Два" }] };

type Loaded = { validation: typeof ValidationModule; apply: typeof ApplyModule };

function loadWithFixture(): Loaded {
  const actual = jest.requireActual("../catalog.generated.json");
  const base = actual.templates["long-morning"];
  const fixture = {
    ...actual,
    blocks: [
      ...actual.blocks,
      { id: UNCHECKED, category: "test", placement: "home", status: "live", props: true, propsEditable: false },
    ],
    templates: {
      ...actual.templates,
      "with-unchecked": {
        ...base,
        id: "with-unchecked",
        sections: [...base.sections, { block: UNCHECKED, props: OWN_PROPS }],
      },
    },
  };
  let loaded!: Loaded;
  jest.isolateModules(() => {
    jest.doMock("../catalog.generated.json", () => fixture);
    loaded = { validation: require("../validation"), apply: require("../apply") };
  });
  return loaded;
}

const { validation, apply } = loadWithFixture();
const template = () => JSON.parse(JSON.stringify(apply.catalogTemplate("with-unchecked")));
const UNCHECKED_AT = 4;

const verdict = (result: { ok: boolean; errors?: { field: string; message: string }[] }) =>
  result.ok ? [] : (result.errors ?? []).map((error) => `${error.field}: ${error.message}`);

describe("props of a block the backend cannot check", () => {
  it("the fixture block has props, no check, and is not editable", () => {
    expect(validation.catalogBlock(UNCHECKED)).toMatchObject({ props: true, propsEditable: false });
    expect(validation.PROPS_CHECKS[UNCHECKED]).toBeUndefined();
  });

  it("takes the props its catalogue template gives it", () => {
    expect(verdict(validation.validateTemplate(template()))).toEqual([]);
    const applied = apply.applyTemplate(apply.catalogTemplate("with-unchecked"));
    expect(applied.ok && applied.manifest.sections[UNCHECKED_AT]).toEqual({ block: UNCHECKED, props: OWN_PROPS });
  });

  it("takes them back unchanged in an override, keys in another order", () => {
    const props = { items: [{ ru: "Раз" }, { ru: "Два" }], title: { en: "Our story", ru: "Наша история" } };
    const applied = apply.applyTemplate(apply.catalogTemplate("with-unchecked"), {
      sections: [{ index: UNCHECKED_AT, block: UNCHECKED, props }],
    });
    expect(verdict(applied)).toEqual([]);
  });

  it("refuses an override that changes them, at the override", () => {
    const applied = apply.applyTemplate(apply.catalogTemplate("with-unchecked"), {
      sections: [{ index: UNCHECKED_AT, block: UNCHECKED, props: { ...OWN_PROPS, title: { ru: "Своё" } } }],
    });
    expect(verdict(applied)).toEqual([`overrides.sections[0].props: props of ${UNCHECKED} cannot be changed yet`]);
  });

  it("refuses changed, missing or reordered-list props in the template itself", () => {
    const at = `sections[${UNCHECKED_AT}].props: props of ${UNCHECKED} cannot be changed yet`;
    const changed = template();
    changed.sections[UNCHECKED_AT].props.items.push({ ru: "Три" });
    expect(verdict(validation.validateTemplate(changed))).toEqual([at]);

    const missing = template();
    delete missing.sections[UNCHECKED_AT].props;
    expect(verdict(validation.validateTemplate(missing))).toEqual([at]);

    const reordered = template();
    reordered.sections[UNCHECKED_AT].props.items.reverse();
    expect(verdict(validation.validateTemplate(reordered))).toEqual([at]);
  });

  it("refuses its props in a template the catalogue does not hold", () => {
    const stranger = { ...template(), id: "not-in-the-catalogue" };
    expect(verdict(validation.validateTemplate(stranger))).toEqual([
      `sections[${UNCHECKED_AT}].props: props of ${UNCHECKED} cannot be changed yet`,
    ]);
  });

  it("keeps them through a plain PUT that moves the section, matching by block, not by index", () => {
    const applied = apply.applyTemplate(apply.catalogTemplate("with-unchecked"));
    if (!applied.ok) throw new Error("the fixture template does not apply");
    const saved = apply.documentFromTemplate(applied.manifest, "home-goods", null, "2026-10-13T00:00:00.000Z");
    const carried = apply.carryTemplateOver(saved, {
      settings: { ...saved.settings, tiles: "off" },
      preset: "home-goods",
    });
    expect(carried.reason).toBeUndefined();
    expect(carried.carried?.sections.map((section) => section.block)).toEqual([
      "announcement/text-bar",
      "hero/h",
      "listing/p4",
      UNCHECKED,
    ]);
    expect(carried.carried?.sections[3]).toEqual({ block: UNCHECKED, props: OWN_PROPS });
  });

  it("still checks a block that has a check: text-bar takes new props and refuses bad ones", () => {
    const fresh = apply.applyTemplate(apply.catalogTemplate("with-unchecked"), {
      sections: [{ index: 0, block: "announcement/text-bar", props: { text: { ru: "Свои слова" } } }],
    });
    expect(fresh.ok && fresh.manifest.sections[0]).toEqual({
      block: "announcement/text-bar",
      props: { text: { ru: "Свои слова" } },
    });
    const bad = apply.applyTemplate(apply.catalogTemplate("with-unchecked"), {
      sections: [{ index: 0, block: "announcement/text-bar", props: { text: { xx: "Hi" } } }],
    });
    expect(verdict(bad)).toEqual(["sections[0].props: text.xx: not a language of i18n/config.ts"]);
  });
});
