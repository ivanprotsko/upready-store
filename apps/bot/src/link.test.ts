import { strict as assert } from "node:assert";
import test from "node:test";

import { chatTitle, isLinkPayload, readLinkConfig, redeemLinkCode } from "./link.ts";
import type { TelegramChat } from "./telegram.ts";

/**
 * Привязка чата к магазину (t08-order-notifications). Сеть не нужна: `fetch`
 * подменяется на время теста, как и положено чистой границе.
 */

const CHAT: TelegramChat = { id: -100123, type: "private", username: "oksana" };

test("payload привязки отличается от тарифного", () => {
  assert.equal(isLinkPayload("lk_AbCdEfGhIjKl"), true);
  assert.equal(isLinkPayload("plan_2"), false);
  assert.equal(isLinkPayload(""), false);
  assert.equal(isLinkPayload("lk_short"), false);
});

test("конфигурация нужна целиком, половина не считается", () => {
  assert.equal(readLinkConfig({}), null);
  assert.equal(readLinkConfig({ UPREADY_BACKEND_URL: "http://b:9000" }), null);
  assert.deepEqual(
    readLinkConfig({ UPREADY_BACKEND_URL: "http://b:9000/", TELEGRAM_LINK_SECRET: "s" }),
    { backendUrl: "http://b:9000", secret: "s" },
  );
});

test("подпись чата собирается из названия группы и имени человека", () => {
  assert.equal(chatTitle(CHAT, { first_name: "Оксана" }), "Оксана @oksana");
  assert.equal(chatTitle({ id: 1, type: "group", title: "Магазин" }), "Магазин");
});

test("успешная привязка печатает текст бэкенда", async () => {
  const original = globalThis.fetch;
  let seen: { url: string; body: unknown; secret: string } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = {
      url: String(url),
      body: JSON.parse(String(init.body)),
      secret: String((init.headers as Record<string, string>)["x-telegram-link-secret"]),
    };
    return new Response(JSON.stringify({ status: "linked", message: "Готово: магазин «Х»." }), {
      status: 200,
    });
  }) as typeof fetch;

  try {
    const outcome = await redeemLinkCode(
      { backendUrl: "http://backend:9000", secret: "shh" },
      "lk_AbCdEfGhIjKl",
      CHAT,
      { first_name: "Оксана", language_code: "ru" },
    );
    assert.equal(outcome.status, "linked");
    assert.equal(outcome.text, "Готово: магазин «Х».");
    assert.equal(seen!.url, "http://backend:9000/telegram/link");
    assert.equal(seen!.secret, "shh");
    assert.deepEqual(seen!.body, {
      code: "lk_AbCdEfGhIjKl",
      chat_id: "-100123",
      chat_title: "Оксана @oksana",
      language_code: "ru",
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("истёкший код — это ответ владельцу, а не молчание", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ status: "expired", message: "Код устарел." }), {
      status: 410,
    })) as typeof fetch;

  try {
    const outcome = await redeemLinkCode(
      { backendUrl: "http://backend:9000", secret: "shh" },
      "lk_AbCdEfGhIjKl",
      CHAT,
    );
    assert.equal(outcome.status, "expired");
    assert.equal(outcome.text, "Код устарел.");
  } finally {
    globalThis.fetch = original;
  }
});

test("упавшая сеть и 500 тоже доходят до владельца", async () => {
  const original = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const outcome = await redeemLinkCode(
      { backendUrl: "http://backend:9000", secret: "shh" },
      "lk_AbCdEfGhIjKl",
      CHAT,
    );
    assert.equal(outcome.status, "error");
    assert.match(outcome.text, /ECONNREFUSED/);
  } finally {
    globalThis.fetch = original;
  }

  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  try {
    const outcome = await redeemLinkCode(
      { backendUrl: "http://backend:9000", secret: "shh" },
      "lk_AbCdEfGhIjKl",
      CHAT,
    );
    assert.equal(outcome.status, "error");
    assert.match(outcome.text, /500/);
  } finally {
    globalThis.fetch = original;
  }
});
