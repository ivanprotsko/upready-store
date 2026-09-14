/**
 * capture.mjs — снимает ИСХОДЯЩИЕ `sendMessage` живого процесса бота.
 *
 * Поднимает приёмник Bot API на локальном порту, запускает НАСТОЯЩИЙ
 * `apps/bot/src/index.ts` с `TELEGRAM_API_BASE`, направленным на себя, и
 * скармливает ему апдейты той формы, какую Telegram присылает по диплинку
 * `?start=plan_<n>`. Наружу ничего не уходит, боевой токен не используется:
 * проверяется путь «апдейт → ядро → тело sendMessage», а живость самого
 * канала снята отдельно — реальным getMe в `run-live.log`.
 *
 * Запуск:
 *   node artifacts/docs/2026-09-14-upreadystore-bot/capture.mjs <выходной-каталог>
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const botDir = join(repoRoot, "apps/bot");
const outDir = resolve(process.argv[2] ?? here);

/** Апдейты в том виде, в каком их присылает Telegram. */
const UPDATES = [
  { label: "/start plan_1", update: startUpdate(101, "/start plan_1") },
  { label: "/start plan_2", update: startUpdate(102, "/start plan_2") },
  { label: "/start plan_3", update: startUpdate(103, "/start plan_3") },
  { label: "/start (без payload)", update: startUpdate(104, "/start") },
  { label: "нажатие кнопки «Профи» в меню", update: callbackUpdate(105, "plan_2") },
];

function startUpdate(id, text) {
  return {
    update_id: id,
    message: {
      message_id: id,
      from: { id: 424242, is_bot: false, first_name: "Иван" },
      chat: { id: 424242, type: "private", first_name: "Иван" },
      date: 1_757_800_000,
      text,
      entities: [{ offset: 0, length: 6, type: "bot_command" }],
    },
  };
}

function callbackUpdate(id, data) {
  return {
    update_id: id,
    callback_query: {
      id: `cb-${id}`,
      from: { id: 424242, is_bot: false, first_name: "Иван" },
      message: { message_id: id - 1, chat: { id: 424242, type: "private" }, date: 1_757_800_000 },
      data,
    },
  };
}

const scenarios = process.argv.includes("--with-links")
  ? {
      name: "ссылки Tribute заданы",
      env: {
        TRIBUTE_URL_PLAN_1_RU_MIR: "https://t.me/tribute/app?startapp=demo-p1-ru",
        TRIBUTE_URL_PLAN_1_VISA_MC: "https://t.me/tribute/app?startapp=demo-p1-intl",
        TRIBUTE_URL_PLAN_2_RU_MIR: "https://t.me/tribute/app?startapp=demo-p2-ru",
        TRIBUTE_URL_PLAN_2_VISA_MC: "https://t.me/tribute/app?startapp=demo-p2-intl",
        TRIBUTE_URL_PLAN_3_RU_MIR: "https://t.me/tribute/app?startapp=demo-p3-ru",
        TRIBUTE_URL_PLAN_3_VISA_MC: "https://t.me/tribute/app?startapp=demo-p3-intl",
      },
      file: "capture-with-links",
    }
  : { name: "ссылок Tribute ещё нет", env: {}, file: "capture-no-links" };

const queue = [...UPDATES];
const captured = [];
let done;
const finished = new Promise((resolve_) => {
  done = resolve_;
});

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const method = (req.url ?? "").split("/").pop();
    const reply = (payload) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (method === "getMe") {
      return reply({ ok: true, result: { id: 1, username: "capture", first_name: "capture" } });
    }
    if (method === "getUpdates") {
      const next = queue.shift();
      if (next === undefined) {
        // Очередь пуста и все ответы сняты — прогон окончен.
        if (captured.length >= UPDATES.length) done();
        return reply({ ok: true, result: [] });
      }
      return reply({ ok: true, result: [next.update] });
    }
    if (method === "sendMessage") {
      const parsed = JSON.parse(body);
      captured.push({ label: UPDATES[captured.length]?.label ?? "?", body: parsed });
      if (captured.length >= UPDATES.length) done();
      return reply({ ok: true, result: { message_id: 900 + captured.length, chat: parsed.chat_id } });
    }
    if (method === "answerCallbackQuery") return reply({ ok: true, result: true });
    return reply({ ok: false, error_code: 404, description: `unexpected ${method}` });
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const child = spawn(process.execPath, ["src/index.ts"], {
  cwd: botDir,
  env: {
    ...process.env,
    ...scenarios.env,
    TELEGRAM_API_BASE: `http://127.0.0.1:${port}`,
    // Боевой токен в захвате не участвует.
    TELEGRAM_UPREADY_STORE_BOT: "capture-run-not-a-real-token",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let operatorLog = "";
child.stdout.on("data", (d) => (operatorLog += d));
child.stderr.on("data", (d) => (operatorLog += d));

const timer = setTimeout(() => done(), 30_000);
await finished;
clearTimeout(timer);
child.kill("SIGINT");
await new Promise((r) => child.once("exit", r));
server.close();

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, `${scenarios.file}.json`), JSON.stringify(captured, null, 2) + "\n");
await writeFile(join(outDir, `${scenarios.file}.operator.log`), operatorLog);

const md = [`# Исходящие sendMessage — ${scenarios.name}`, ""];
for (const item of captured) {
  md.push(`## ${item.label}`, "", "```json", JSON.stringify(item.body, null, 2), "```", "");
}
await writeFile(join(outDir, `${scenarios.file}.md`), md.join("\n"));

console.log(
  `снято ответов: ${captured.length} из ${UPDATES.length}; сценарий: ${scenarios.name}; каталог: ${outDir}`,
);
process.exit(captured.length === UPDATES.length ? 0 : 1);
