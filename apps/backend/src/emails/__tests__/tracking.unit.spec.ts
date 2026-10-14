import { trackingLine, trackingLines, trackingUrl, trackingUrls } from "../lib/tracking";

/**
 * The shipment letter's tracking line. The regression these guard is not
 * hypothetical: the template's own copy of this rule named itself on the
 * right-hand side, which threw inside the `shipment.created` handler and cost
 * every customer their "your parcel is on its way" letter.
 */
describe("trackingLine", () => {
  it("puts the carrier in front of the number", () => {
    expect(trackingLine({ tracking_number: "1005248796431" }, "СДЭК")).toBe(
      "СДЭК 1005248796431",
    );
  });

  it("gives the bare number when no carrier was typed", () => {
    expect(trackingLine({ tracking_number: "1005248796431" }, null)).toBe(
      "1005248796431",
    );
    expect(trackingLine({ tracking_number: "1005248796431" })).toBe("1005248796431");
  });

  it("treats a blank carrier as no carrier, never as a leading space", () => {
    expect(trackingLine({ tracking_number: "42" }, "   ")).toBe("42");
  });

  it("trims what the owner typed", () => {
    expect(trackingLine({ tracking_number: "  42  " }, "  СДЭК ")).toBe("СДЭК 42");
  });

  it("is empty for a label with no number, carrier or not", () => {
    expect(trackingLine({ tracking_number: null }, "СДЭК")).toBe("");
    expect(trackingLine({}, "СДЭК")).toBe("");
    expect(trackingLine({ tracking_number: "   " })).toBe("");
  });

  it("returns a string rather than recursing", () => {
    // A self-referential helper blew the stack here; a plain call must finish.
    expect(() => trackingLine({ tracking_number: "1" }, "СДЭК")).not.toThrow();
  });
});

describe("trackingLines", () => {
  it("renders one line per numbered label", () => {
    expect(
      trackingLines(
        [{ tracking_number: "1" }, { tracking_number: "2" }],
        "Почта России",
      ),
    ).toEqual(["Почта России 1", "Почта России 2"]);
  });

  it("drops labels that carry no number", () => {
    expect(
      trackingLines([{ tracking_number: "1" }, { tracking_url: "https://x/1" }], null),
    ).toEqual(["1"]);
  });

  it("is empty for a fulfillment shipped without a tracking number", () => {
    expect(trackingLines([], "СДЭК")).toEqual([]);
    expect(trackingLines(null)).toEqual([]);
    expect(trackingLines(undefined)).toEqual([]);
  });
});

/**
 * The link under the number (t-2026-10-14-58, the lead's review): ApiShip and
 * direct СДЭК write `tracking_url` on the label, and the letter printed only
 * the number. The plain-text letter gets the URL on its own line; the HTML
 * letter takes the same URL as the number's href.
 */
describe("trackingUrl", () => {
  it("gives the carrier's page when the label carries one", () => {
    expect(trackingUrl({ tracking_number: "1110019183", tracking_url: "https://www.cdek.ru/ru/tracking/?order_id=1110019183" })).toBe(
      "https://www.cdek.ru/ru/tracking/?order_id=1110019183",
    );
    expect(trackingUrl({ tracking_url: "  http://track.example/42  " })).toBe("http://track.example/42");
  });

  it("is null for a label without a URL", () => {
    expect(trackingUrl({ tracking_number: "1110019183" })).toBeNull();
    expect(trackingUrl({ tracking_url: null })).toBeNull();
    expect(trackingUrl({ tracking_url: "   " })).toBeNull();
  });

  it("refuses anything that is not an http(s) URL, so a typed word never becomes a link", () => {
    expect(trackingUrl({ tracking_url: "cdek.ru/track/1110019183" })).toBeNull();
    expect(trackingUrl({ tracking_url: "javascript:alert(1)" })).toBeNull();
    expect(trackingUrl({ tracking_url: "https://www.cdek.ru/ru tracking" })).toBeNull();
  });
});

describe("trackingUrls", () => {
  it("lists the pages of the numbered labels in order", () => {
    expect(
      trackingUrls([
        { tracking_number: "1", tracking_url: "https://track.example/1" },
        { tracking_number: "2", tracking_url: "https://track.example/2" },
      ]),
    ).toEqual(["https://track.example/1", "https://track.example/2"]);
  });

  it("skips a label without a number, without a URL, or with one that is not a URL", () => {
    expect(
      trackingUrls([
        { tracking_url: "https://track.example/no-number" },
        { tracking_number: "1" },
        { tracking_number: "2", tracking_url: "track.example/2" },
        { tracking_number: "3", tracking_url: "https://track.example/3" },
      ]),
    ).toEqual(["https://track.example/3"]);
  });

  it("names a page once when two labels share it", () => {
    expect(
      trackingUrls([
        { tracking_number: "1", tracking_url: "https://track.example/same" },
        { tracking_number: "2", tracking_url: "https://track.example/same" },
      ]),
    ).toEqual(["https://track.example/same"]);
  });

  it("is empty for a fulfillment shipped without labels", () => {
    expect(trackingUrls([])).toEqual([]);
    expect(trackingUrls(null)).toEqual([]);
    expect(trackingUrls(undefined)).toEqual([]);
  });
});
