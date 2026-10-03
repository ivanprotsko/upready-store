import { mergeHreflangSisters, readHreflangSistersOverride } from "../hreflang-sisters";

describe("readHreflangSistersOverride", () => {
  it("is empty for a tenant that never saved an override", () => {
    expect(readHreflangSistersOverride(null)).toEqual([]);
    expect(readHreflangSistersOverride({})).toEqual([]);
  });

  it("reads a saved override", () => {
    const metadata = { hreflang_sisters: [{ domain: "cherkashino.com", locale: "en" }] };

    expect(readHreflangSistersOverride(metadata)).toEqual([
      { domain: "cherkashino.com", locale: "en" },
    ]);
  });

  it("drops a malformed entry rather than throwing", () => {
    const metadata = {
      hreflang_sisters: [
        { domain: "cherkashino.com", locale: "en" },
        { domain: "cherkashino.com" },
        null,
        "not-an-object",
      ],
    };

    expect(readHreflangSistersOverride(metadata)).toEqual([
      { domain: "cherkashino.com", locale: "en" },
    ]);
  });
});

describe("mergeHreflangSisters", () => {
  it("concatenates two disjoint lists", () => {
    const groupDerived = [{ domain: "cherkashino.com", locale: "en" }];
    const override = [{ domain: "cherkashino.rf", locale: "ru" }];

    expect(mergeHreflangSisters(groupDerived, override)).toEqual([
      { domain: "cherkashino.com", locale: "en" },
      { domain: "cherkashino.rf", locale: "ru" },
    ]);
  });

  it("lets the override win over a group-derived entry for the same domain", () => {
    const groupDerived = [{ domain: "Cherkashino.com", locale: "en" }];
    const override = [{ domain: "cherkashino.com", locale: "en-us" }];

    expect(mergeHreflangSisters(groupDerived, override)).toEqual([
      { domain: "cherkashino.com", locale: "en-us" },
    ]);
  });

  it("is the group-derived list, unchanged, when there is no override", () => {
    const groupDerived = [{ domain: "cherkashino.com", locale: "en" }];

    expect(mergeHreflangSisters(groupDerived, [])).toEqual(groupDerived);
  });
});
