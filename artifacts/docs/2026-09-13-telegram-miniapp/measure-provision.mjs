#!/usr/bin/env node
/**
 * Measures the automatic part of "a store gets its Telegram Mini App":
 * one POST /admin/telegram-mini-app, timed end to end from the client, with
 * the per-step Bot API timings the backend reports, then the public
 * GET /store/telegram-mini-app a storefront would read.
 *
 *   node measure-provision.mjs <backend> <bot token> <storefront https url> [runs]
 *   env: ADMIN_EMAIL / ADMIN_PASSWORD (default admin@upready.dev / supersecret),
 *        PUBLISHABLE_KEY (for the /store read; optional)
 *
 * Against the mock (mock-bot-api.mjs) the numbers are the backend's own cost;
 * against api.telegram.org they are the real thing.
 */
const [backend, token, storefrontUrl, runsArg] = process.argv.slice(2);
if (!backend || !token || !storefrontUrl) {
  console.error("usage: measure-provision.mjs <backend> <bot token> <storefront https url> [runs]");
  process.exit(2);
}
const runs = Number(runsArg ?? 3);
const email = process.env.ADMIN_EMAIL ?? "admin@upready.dev";
const password = process.env.ADMIN_PASSWORD ?? "supersecret";

async function json(path, init = {}) {
  const t0 = performance.now();
  const res = await fetch(`${backend}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const ms = Math.round(performance.now() - t0);
  let body = {};
  try { body = await res.json(); } catch { /* status carries the verdict */ }
  return { status: res.status, ms, body };
}

const login = await json("/auth/user/emailpass", { method: "POST", body: JSON.stringify({ email, password }) });
if (login.status !== 200) {
  console.error("admin login failed", login.status, login.body);
  process.exit(1);
}
const auth = { Authorization: `Bearer ${login.body.token}` };
const rows = [];
for (let i = 1; i <= runs; i++) {
  const r = await json("/admin/telegram-mini-app", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      bot_token: token,
      storefront_url: storefrontUrl,
      button_text: "Магазин",
      name: "Ferrite",
      short_description: "Абстрактный магазин: сферы, кубы, цилиндры",
      commands: [{ command: "start", description: "Открыть магазин" }],
    }),
  });
  const app = r.body.mini_app;
  rows.push({ run: i, status: r.status, clientMs: r.ms, backendMs: app?.totalMs, steps: app?.steps, launch: app?.launch, error: r.status === 200 ? undefined : r.body });
}
for (const row of rows) {
  console.log(`run ${row.run}: HTTP ${row.status}, client ${row.clientMs} ms, backend ${row.backendMs ?? "-"} ms`);
  for (const s of row.steps ?? []) console.log(`   ${s.name.padEnd(24)} ${s.skipped ? "skipped" : s.ms + " ms"}`);
  if (row.error) console.log("   error", JSON.stringify(row.error));
}
const ok = rows.filter((r) => r.status === 200);
if (ok.length) {
  const med = (xs) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  console.log(`median client ${med(ok.map((r) => r.clientMs))} ms, median backend ${med(ok.map((r) => r.backendMs))} ms over ${ok.length} runs`);
  console.log("launch:", JSON.stringify(ok[ok.length - 1].launch));
}
if (process.env.PUBLISHABLE_KEY) {
  const pub = await json("/store/telegram-mini-app", { headers: { "x-publishable-api-key": process.env.PUBLISHABLE_KEY } });
  console.log(`GET /store/telegram-mini-app: HTTP ${pub.status} in ${pub.ms} ms`, JSON.stringify(pub.body));
}
