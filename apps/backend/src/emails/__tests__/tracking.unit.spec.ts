import { trackingLine, trackingLines } from "../lib/tracking";

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
