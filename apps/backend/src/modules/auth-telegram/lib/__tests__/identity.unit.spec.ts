import {
  authIdentityEntityId,
  isSyntheticTelegramEmail,
  syntheticEmailFor,
  telegramDisplayName,
} from "../identity";

describe("syntheticEmailFor / isSyntheticTelegramEmail", () => {
  it("builds the tg_<id>@telegram.local key", () => {
    expect(syntheticEmailFor(42)).toBe("tg_42@telegram.local");
  });

  it("recognises its own synthetic address", () => {
    expect(isSyntheticTelegramEmail(syntheticEmailFor(42))).toBe(true);
    expect(isSyntheticTelegramEmail("TG_42@TELEGRAM.LOCAL")).toBe(true);
  });

  it("never flags a real address, Yandex's included", () => {
    expect(isSyntheticTelegramEmail("oksana@cherkashinao.ru")).toBe(false);
    expect(isSyntheticTelegramEmail("buyer@yandex.ru")).toBe(false);
    expect(isSyntheticTelegramEmail(null)).toBe(false);
    expect(isSyntheticTelegramEmail(undefined)).toBe(false);
  });

  it("does not flag a look-alike domain (not an exact @telegram.local suffix match is still required)", () => {
    expect(isSyntheticTelegramEmail("tg_42@telegram.local.evil.com")).toBe(false);
    expect(isSyntheticTelegramEmail("nottelegram.local@example.com")).toBe(false);
  });
});

describe("authIdentityEntityId", () => {
  it("is store-wide, not tenant-scoped (one Telegram user, one customer across shops)", () => {
    expect(authIdentityEntityId(42)).toBe("telegram:42");
    expect(authIdentityEntityId("42")).toBe("telegram:42");
  });
});

describe("telegramDisplayName", () => {
  it("prefers the full name", () => {
    expect(
      telegramDisplayName({
        telegram_username: "cherkashinao",
        telegram_first_name: "Oksana",
        telegram_last_name: "Cherkashina",
      }),
    ).toBe("Oksana Cherkashina");
  });

  it("falls back to the @username when there is no name", () => {
    expect(
      telegramDisplayName({
        telegram_username: "cherkashinao",
        telegram_first_name: null,
        telegram_last_name: null,
      }),
    ).toBe("@cherkashinao");
  });

  it("is null when there is nothing at all", () => {
    expect(
      telegramDisplayName({
        telegram_username: null,
        telegram_first_name: null,
        telegram_last_name: null,
      }),
    ).toBeNull();
  });
});
