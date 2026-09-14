import { test } from "node:test";
import assert from "node:assert/strict";

import { payloadFromStart, routeUpdate } from "./route.ts";
import type { TelegramUpdate } from "./telegram.ts";

function messageUpdate(text: string): TelegramUpdate {
  return { update_id: 1, message: { message_id: 10, chat: { id: 777, type: "private" }, text } };
}

test("payload команды /start во всех живых формах", () => {
  assert.equal(payloadFromStart("/start plan_2"), "plan_2");
  assert.equal(payloadFromStart("/start@upreadystore_bot plan_3"), "plan_3");
  assert.equal(payloadFromStart("  /start   plan_1  "), "plan_1");
  assert.equal(payloadFromStart("/start"), "");
  assert.equal(payloadFromStart("/help"), null);
  assert.equal(payloadFromStart("start plan_2"), null);
});

test("диплинк тарифа приходит как /start plan_N", () => {
  const action = routeUpdate(messageUpdate("/start plan_3"));
  assert.deepEqual(action, { kind: "reply", chatId: 777, payload: "plan_3", source: "command" });
});

test("нажатие кнопки меню приходит как callback_query и требует ответа на неё", () => {
  const action = routeUpdate({
    update_id: 2,
    callback_query: {
      id: "cb-1",
      data: "plan_2",
      from: { id: 777 },
      message: { message_id: 11, chat: { id: 555, type: "private" } },
    },
  });
  assert.deepEqual(action, {
    kind: "reply",
    chatId: 555,
    payload: "plan_2",
    source: "callback",
    callbackQueryId: "cb-1",
  });
});

test("любой другой текст ведёт в меню, а не в молчание", () => {
  assert.deepEqual(routeUpdate(messageUpdate("привет")), {
    kind: "reply",
    chatId: 777,
    payload: "",
    source: "text",
  });
});

test("апдейт без текста пропускается", () => {
  assert.equal(routeUpdate({ update_id: 3 }).kind, "ignore");
  assert.equal(
    routeUpdate({ update_id: 4, message: { message_id: 1, chat: { id: 1, type: "private" } } }).kind,
    "ignore",
  );
});
