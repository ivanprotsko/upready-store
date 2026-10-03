import { botIdFromToken } from "../telegram";

describe("botIdFromToken", () => {
  it("takes the numeric id before the colon and nothing after it", () => {
    expect(botIdFromToken("7012345678:AAH-abc_DEF")).toBe(7012345678);
    expect(botIdFromToken("  7012345678:AAH-abc_DEF \n")).toBe(7012345678);
  });

  it("answers null for anything that is not a bot token", () => {
    expect(botIdFromToken("AAH-abc")).toBeNull();
    expect(botIdFromToken(":AAH")).toBeNull();
    expect(botIdFromToken("0:AAH")).toBeNull();
    expect(botIdFromToken("")).toBeNull();
  });
});
