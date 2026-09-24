import {
  botChatUrl,
  directLinkUrl,
  isValidBotUsername,
  isValidStartParam,
  mainMiniAppUrl,
  menuButtonFor,
  miniAppEntryUrl,
  platformLaunchUrl,
} from "../mini-app";

describe("bot usernames", () => {
  it("accepts 5-32 Latin chars ending in bot, case-insensitively", () => {
    expect(isValidBotUsername("upready_store_bot")).toBe(true);
    expect(isValidBotUsername("AcmeBot")).toBe(true);
    expect(isValidBotUsername("a_bot")).toBe(true);
  });
  it("rejects what BotFather rejects", () => {
    expect(isValidBotUsername("shop")).toBe(false); // does not end in bot
    expect(isValidBotUsername("bot")).toBe(false); // shorter than 5
    expect(isValidBotUsername("мойbot")).toBe(false); // not Latin
    expect(isValidBotUsername("1_bot")).toBe(false); // cannot start with a digit
    expect(isValidBotUsername("a".repeat(30) + "bot")).toBe(false); // longer than 32
  });
});

describe("launch urls", () => {
  it("builds the chat, main Mini App and direct links", () => {
    expect(botChatUrl("@upready_store_bot")).toBe("https://t.me/upready_store_bot");
    expect(mainMiniAppUrl("upready_store_bot")).toBe("https://t.me/upready_store_bot?startapp");
    expect(mainMiniAppUrl("upready_store_bot", "ferrite")).toBe(
      "https://t.me/upready_store_bot?startapp=ferrite"
    );
    expect(directLinkUrl("upready_store_bot", "shop")).toBe("https://t.me/upready_store_bot/shop");
    expect(directLinkUrl("upready_store_bot", "shop", "product_cube")).toBe(
      "https://t.me/upready_store_bot/shop?startapp=product_cube"
    );
  });
  it("the platform link is the main Mini App link with the store handle", () => {
    expect(platformLaunchUrl({ platformBot: "upready_store_bot", storeHandle: "long-morning" })).toBe(
      "https://t.me/upready_store_bot?startapp=long-morning"
    );
  });
  it("refuses a start parameter Telegram would not carry", () => {
    expect(isValidStartParam("product_cube-01")).toBe(true);
    expect(isValidStartParam("")).toBe(false);
    expect(isValidStartParam("a b")).toBe(false);
    expect(isValidStartParam("x".repeat(65))).toBe(false);
    expect(() => mainMiniAppUrl("upready_store_bot", "a/b")).toThrow(/startapp/);
  });
});

describe("menu button", () => {
  it("points at <storefront>/mini and keeps a base path", () => {
    expect(miniAppEntryUrl("https://ferrite.upready.dev")).toBe("https://ferrite.upready.dev/mini");
    expect(miniAppEntryUrl("https://ferrite.upready.dev/")).toBe("https://ferrite.upready.dev/mini");
    expect(miniAppEntryUrl("https://example.com/shop/")).toBe("https://example.com/shop/mini");
    expect(menuButtonFor({ storefrontUrl: "https://ferrite.upready.dev", text: " Магазин " })).toEqual({
      type: "web_app",
      text: "Магазин",
      web_app: { url: "https://ferrite.upready.dev/mini" },
    });
  });
  it("refuses http and empty text — Telegram would refuse them later, with a worse message", () => {
    expect(() => miniAppEntryUrl("http://localhost:8000")).toThrow(/HTTPS/);
    expect(() => miniAppEntryUrl("not a url")).toThrow(/Not a URL/);
    expect(() => menuButtonFor({ storefrontUrl: "https://a.b", text: "  " })).toThrow(/empty/);
  });
});
