import { createBotApi, TelegramBotApiError } from "../bot-api";
import { provisionMiniApp, resetMiniApp } from "../provision";

type Call = { method: string; params: Record<string, unknown> };

/** A fake Bot API: records calls, answers like Telegram, fails where told to. */
function fakeTelegram(options: { failOn?: string; name?: string } = {}) {
  const calls: Call[] = [];
  const state = { name: options.name ?? "Old name", short: "", description: "" };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = url.slice(url.lastIndexOf("/") + 1);
    const params = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ method, params });
    const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (options.failOn === method) {
      return reply({ ok: false, error_code: 401, description: "Unauthorized" });
    }
    switch (method) {
      case "getMe":
        return reply({ ok: true, result: { id: 42, is_bot: true, first_name: state.name, username: "ferrite_shop_bot" } });
      case "getMyName":
        return reply({ ok: true, result: { name: state.name } });
      case "getMyShortDescription":
        return reply({ ok: true, result: { short_description: state.short } });
      case "getMyDescription":
        return reply({ ok: true, result: { description: state.description } });
      default:
        return reply({ ok: true, result: true });
    }
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("provisionMiniApp", () => {
  it("validates the token, sets the menu button, writes only the profile fields that differ", async () => {
    const tg = fakeTelegram({ name: "Ferrite" });
    const api = createBotApi({ token: "123:abc", baseUrl: "https://mock.local", fetchImpl: tg.fetchImpl });
    const result = await provisionMiniApp({
      token: "123:abc",
      storefrontUrl: "https://ferrite.upready.dev",
      buttonText: "Магазин",
      profile: { name: "Ferrite", shortDescription: "Абстрактный магазин", commands: [{ command: "start", description: "Открыть магазин" }] },
      api,
    });

    expect(tg.calls.map((c) => c.method)).toEqual([
      "getMe",
      "setChatMenuButton",
      "getMyName",
      "getMyShortDescription",
      "setMyShortDescription",
      "setMyCommands",
    ]);
    expect(tg.calls[1].params).toEqual({
      menu_button: { type: "web_app", text: "Магазин", web_app: { url: "https://ferrite.upready.dev/mini" } },
    });
    expect(result.bot).toEqual({ id: 42, username: "ferrite_shop_bot", name: "Ferrite" });
    expect(result.launch.chatUrl).toBe("https://t.me/ferrite_shop_bot");
    expect(result.launch.mainMiniAppUrl).toBe("https://t.me/ferrite_shop_bot?startapp");
    expect(result.launch.menuButton.url).toBe("https://ferrite.upready.dev/mini");
    expect(result.steps.find((s) => s.name === "setMyName")).toEqual({ name: "setMyName", ms: 0, skipped: true });
    expect(result.steps.every((s) => typeof s.ms === "number")).toBe(true);
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("stops at the first Telegram error and says which method failed", async () => {
    const tg = fakeTelegram({ failOn: "getMe" });
    const api = createBotApi({ token: "bad", baseUrl: "https://mock.local", fetchImpl: tg.fetchImpl });
    await expect(
      provisionMiniApp({ token: "bad", storefrontUrl: "https://ferrite.upready.dev", buttonText: "Магазин", api })
    ).rejects.toMatchObject({ name: "TelegramBotApiError", method: "getMe", errorCode: 401 });
    expect(tg.calls.map((c) => c.method)).toEqual(["getMe"]);
  });

  it("refuses an http storefront before touching Telegram beyond getMe", async () => {
    const tg = fakeTelegram();
    const api = createBotApi({ token: "123:abc", baseUrl: "https://mock.local", fetchImpl: tg.fetchImpl });
    await expect(
      provisionMiniApp({ token: "123:abc", storefrontUrl: "http://localhost:8000", buttonText: "Магазин", api })
    ).rejects.toThrow(/HTTPS/);
    expect(tg.calls.map((c) => c.method)).toEqual(["getMe"]);
  });

  it("a transport failure is a TelegramBotApiError with code 0", async () => {
    const fetchImpl = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const api = createBotApi({ token: "123:abc", baseUrl: "https://mock.local", fetchImpl });
    await expect(api.getMe()).rejects.toBeInstanceOf(TelegramBotApiError);
    await expect(api.getMe()).rejects.toMatchObject({ errorCode: 0, description: "fetch failed" });
  });

  it("reset puts the default menu button back", async () => {
    const tg = fakeTelegram();
    const api = createBotApi({ token: "123:abc", baseUrl: "https://mock.local", fetchImpl: tg.fetchImpl });
    const step = await resetMiniApp({ token: "123:abc", api });
    expect(step.name).toBe("setChatMenuButton:default");
    expect(tg.calls[0].params).toEqual({ menu_button: { type: "default" } });
  });
});
