import {
  generateWebhookSecret,
  managerLinkCode,
  webhookSecretMatches,
} from "../webhook-secret";

describe("webhookSecretMatches", () => {
  it("matches the exact secret", () => {
    expect(webhookSecretMatches("s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(webhookSecretMatches("s3cret", "not-it")).toBe(false);
  });

  it("never matches when the expected secret is empty or missing (the chrxnasdmds lesson)", () => {
    expect(webhookSecretMatches("", "")).toBe(false);
    expect(webhookSecretMatches("", "anything")).toBe(false);
    expect(webhookSecretMatches(null, "anything")).toBe(false);
    expect(webhookSecretMatches(undefined, "anything")).toBe(false);
  });

  it("never matches when the received header is empty or missing", () => {
    expect(webhookSecretMatches("s3cret", "")).toBe(false);
    expect(webhookSecretMatches("s3cret", null)).toBe(false);
    expect(webhookSecretMatches("s3cret", undefined)).toBe(false);
  });

  it("reads the first value when the header arrived as an array", () => {
    expect(webhookSecretMatches("s3cret", ["s3cret", "s3cret2"])).toBe(true);
    expect(webhookSecretMatches("s3cret", ["not-it", "s3cret"])).toBe(false);
  });

  it("rejects secrets of different lengths without throwing", () => {
    expect(webhookSecretMatches("s3cret", "s3cretlonger")).toBe(false);
  });
});

describe("generateWebhookSecret", () => {
  it("returns 64 hex characters, inside Telegram's allowed A-Za-z0-9_-", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is different on every call", () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});

describe("managerLinkCode", () => {
  it("derives a stable 16-char code from the webhook secret", () => {
    const code = managerLinkCode("some-secret");
    expect(code).toMatch(/^[0-9a-f]{16}$/);
    expect(managerLinkCode("some-secret")).toBe(code);
  });

  it("changes when the webhook secret changes", () => {
    expect(managerLinkCode("secret-a")).not.toBe(managerLinkCode("secret-b"));
  });
});
