import { TelegramAuthService } from "../telegram";

describe("TelegramAuthService.validateOptions", () => {
  it("accepts no bound (the 24h default) and a positive bound", () => {
    expect(() => TelegramAuthService.validateOptions({})).not.toThrow();
    expect(() => TelegramAuthService.validateOptions({ authDateMaxAgeSec: 3600 })).not.toThrow();
  });

  it("fails at boot on a bound that would switch the freshness check off or mean nothing", () => {
    for (const authDateMaxAgeSec of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => TelegramAuthService.validateOptions({ authDateMaxAgeSec })).toThrow(
        /TELEGRAM_AUTH_MAX_AGE_SEC/,
      );
    }
  });
});
