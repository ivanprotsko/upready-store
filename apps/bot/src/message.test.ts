import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReply, buildMenuMessage } from "./message.ts";
import { readPaymentLinks } from "./payments.ts";
import { METHOD_LABELS, PLANS, planByPayload } from "./plans.ts";

const NO_LINKS = readPaymentLinks({});
const ALL_LINKS = readPaymentLinks({
  TRIBUTE_URL_PLAN_1_RU_MIR: "https://t.me/tribute/app?startapp=p1ru",
  TRIBUTE_URL_PLAN_1_VISA_MC: "https://t.me/tribute/app?startapp=p1intl",
  TRIBUTE_URL_PLAN_2_RU_MIR: "https://t.me/tribute/app?startapp=p2ru",
  TRIBUTE_URL_PLAN_2_VISA_MC: "https://t.me/tribute/app?startapp=p2intl",
  TRIBUTE_URL_PLAN_3_RU_MIR: "https://t.me/tribute/app?startapp=p3ru",
  TRIBUTE_URL_PLAN_3_VISA_MC: "https://t.me/tribute/app?startapp=p3intl",
});

test("подписи кнопок — дословно те, что задал Иван", () => {
  assert.equal(METHOD_LABELS.ru_mir, "Оплатить картой РФ или МИР");
  assert.equal(METHOD_LABELS.visa_mc, "Оплатить картой Visa/MasterCard");

  const { message } = buildReply("plan_2", ALL_LINKS);
  const rows = message.reply_markup?.inline_keyboard ?? [];
  assert.deepEqual(
    rows.map((row) => row[0]?.text),
    ["Оплатить картой РФ или МИР", "Оплатить картой Visa/MasterCard"],
  );
  assert.deepEqual(
    rows.map((row) => row[0]?.url),
    ["https://t.me/tribute/app?startapp=p2ru", "https://t.me/tribute/app?startapp=p2intl"],
  );
});

test("каждый payload называет свой тариф, его цену и то, что входит", () => {
  for (const plan of PLANS) {
    const { message } = buildReply(plan.payload, ALL_LINKS);
    assert.ok(message.text.includes(`<b>${plan.name}</b>`), `${plan.payload}: нет имени тарифа`);
    assert.ok(message.text.includes(plan.priceAnnual), `${plan.payload}: нет цены`);
    for (const item of plan.includes) {
      assert.ok(message.text.includes(item), `${plan.payload}: нет строки «${item}»`);
    }
    // Сообщение ОДНО: приветствие + тариф + что входит + оплата.
    assert.equal(message.text.split("\n\n").length, 4);
  }
});

test("в сообщении одного тарифа нет чужих тарифов", () => {
  const { message } = buildReply("plan_2", ALL_LINKS);
  assert.ok(!message.text.includes("Новичок"));
  assert.ok(!message.text.includes("Мастер"));
});

test("платный тариф без ссылок: мёртвых кнопок нет, вместо них честная строка", () => {
  for (const payload of ["plan_2", "plan_3"]) {
    const { message, warnings } = buildReply(payload, NO_LINKS);
    assert.equal(message.reply_markup, undefined, `${payload}: кнопка нарисована без ссылки`);
    assert.ok(message.text.includes("Оплату сейчас подключаем"));
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every((w) => w.level === "warn"));
    assert.deepEqual(
      warnings.map((w) => w.env).sort(),
      [
        `TRIBUTE_URL_PLAN_${payload.slice(-1)}_RU_MIR`,
        `TRIBUTE_URL_PLAN_${payload.slice(-1)}_VISA_MC`,
      ].sort(),
    );
  }
});

test("одна ссылка из двух: рисуется только живая кнопка, вторая названа в тексте", () => {
  const links = readPaymentLinks({ TRIBUTE_URL_PLAN_2_RU_MIR: "https://t.me/tribute/app?startapp=p2ru" });
  const { message, warnings } = buildReply("plan_2", links);
  const rows = message.reply_markup?.inline_keyboard ?? [];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.[0]?.text, "Оплатить картой РФ или МИР");
  assert.ok(message.text.includes("«Оплатить картой Visa/MasterCard» пока подключаем"));
  assert.deepEqual(
    warnings.map((w) => `${w.level}:${w.env}`),
    ["warn:TRIBUTE_URL_PLAN_2_VISA_MC"],
  );
});

test("мусор в переменной — это отсутствие ссылки, а не кнопка", () => {
  const links = readPaymentLinks({ TRIBUTE_URL_PLAN_3_RU_MIR: "  ", TRIBUTE_URL_PLAN_3_VISA_MC: "tribute.tg/p3" });
  const { message, warnings } = buildReply("plan_3", links);
  assert.equal(message.reply_markup, undefined);
  assert.deepEqual(
    warnings.map((w) => w.gap),
    ["unset", "invalid"],
  );
});

test("бесплатный тариф: платить нечего, отсутствие ссылки — не тревога", () => {
  const { message, warnings } = buildReply("plan_1", NO_LINKS);
  assert.equal(message.reply_markup, undefined);
  assert.ok(message.text.includes("Этот тариф бесплатный"));
  assert.ok(!message.text.includes("Оплату сейчас подключаем"));
  assert.ok(warnings.every((w) => w.level === "info"));
});

test("пустой и неизвестный payload ведут в меню из трёх тарифов, а не в первый тариф", () => {
  for (const payload of ["", "   ", "plan_9", "plan_", "мусор"]) {
    const { message } = buildReply(payload, ALL_LINKS);
    assert.deepEqual(message, buildMenuMessage().message, `payload «${payload}» ушёл не в меню`);
    assert.deepEqual(
      (message.reply_markup?.inline_keyboard[0] ?? []).map((b) => [b.text, b.callback_data]),
      [
        ["Новичок", "plan_1"],
        ["Профи", "plan_2"],
        ["Мастер", "plan_3"],
      ],
    );
  }
});

test("payload — это номер карточки страницы: 1 бесплатный, 2 и 3 платные", () => {
  assert.equal(planByPayload("plan_1")?.key, "free");
  assert.equal(planByPayload("plan_2")?.key, "pro");
  assert.equal(planByPayload("plan_3")?.key, "ultra");
  assert.equal(planByPayload("plan_0"), null);
});

test("HTML в тексте экранируется: разметку ломает только <b> из шаблона", () => {
  const { message } = buildReply("plan_2", ALL_LINKS);
  const tags = message.text.match(/<[^>]+>/g) ?? [];
  assert.deepEqual(new Set(tags), new Set(["<b>", "</b>"]));
});
