#!/usr/bin/env node
/**
 * Builds index.html: every store profile that exists in this repository, the
 * stand it runs on, and whether that stand answers right now.
 *
 *   node artifacts/docs/stands/build.mjs
 *
 * Nothing here is hand-maintained. The stands are DISCOVERED from the machine:
 * the listening TCP ports say which processes are up, each process's working
 * directory says which worktree it belongs to, and that worktree's `.env` says
 * which profile and which database. A stand nobody started simply has no
 * listener and is drawn as stopped — the page never claims a port is live
 * because a config file mentions it.
 *
 * Liveness is measured through the page body (`-L`, final status), not the
 * redirect: `/health` on a storefront answers 302 while the site is perfectly
 * up, and reading the redirect instead of the body is how a live stand gets
 * called dead (aie-20260908-055816-722e).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const PROFILES_DIR = path.join(
  REPO,
  "apps/backend/src/migration-scripts/data/profiles",
);
const PSQL = "/opt/homebrew/opt/postgresql@16/bin/psql";

const run = (file, args) => {
  const result = spawnSync(file, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout : "";
};

/** Every listening TCP port with the pid behind it. */
const listeners = () => {
  const out = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-FpPn"]);
  const found = new Map(); // port -> pid
  let pid = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    else if (line.startsWith("n")) {
      const port = /:(\d+)$/.exec(line)?.[1];
      if (port && pid && !found.has(port)) found.set(port, pid);
    }
  }
  return found;
};

const cwdOf = (pid) => {
  const out = run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  return out.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? "";
};

/**
 * The environment a RUNNING process actually has. A stand started with
 * `PORT=9200 DATABASE_URL=…/upready_store_multi npx medusa develop` contradicts
 * its own `.env`, and the file is the one that is wrong: the process is the
 * reality this page reports (rule: acceptance = reality).
 */
const envOf = (pid, keys) => {
  const out = run("ps", ["eww", "-p", String(pid)]);
  const values = {};
  for (const token of out.split(/\s+/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(token);
    if (match && keys.includes(match[1])) values[match[1]] = match[2];
  }
  return values;
};

const readEnv = (file) => {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return values;
};

/** `http://host/path` -> final status code after redirects, or null if nothing answers. */
const probe = (url, seconds = 6) => {
  const out = run("curl", [
    "-s", "-o", "/dev/null", "-L", "--max-time", String(seconds),
    "-w", "%{http_code}", url,
  ]);
  const code = Number(out.trim());
  return Number.isFinite(code) && code > 0 ? code : null;
};

const databaseName = (url) => {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
};

const productCount = (databaseUrl, channelLike) => {
  if (!fs.existsSync(PSQL)) return null;
  try {
    const sql = channelLike
      ? `SELECT count(*) FROM product_sales_channel psc
           JOIN sales_channel sc ON sc.id = psc.sales_channel_id
          WHERE psc.deleted_at IS NULL AND sc.name = '${channelLike.replace(/'/g, "''")}'`
      : "SELECT count(*) FROM product WHERE deleted_at IS NULL";
    return Number(
      execFileSync(PSQL, [databaseUrl, "-tAc", sql], { encoding: "utf8" }).trim(),
    );
  } catch {
    return null;
  }
};

// ── profiles: the themes this repository can build ──────────────────────────
const profiles = fs
  .readdirSync(PROFILES_DIR)
  .filter((id) => fs.existsSync(path.join(PROFILES_DIR, id, "profile.json")))
  .map((id) => {
    const dir = path.join(PROFILES_DIR, id);
    const profile = JSON.parse(
      fs.readFileSync(path.join(dir, "profile.json"), "utf8"),
    );
    const themeFile = path.join(dir, "theme.json");
    const theme = fs.existsSync(themeFile)
      ? JSON.parse(fs.readFileSync(themeFile, "utf8"))
      : null;
    const defaultMode = profile.theme?.defaultMode ?? "light";
    const tokens = theme?.modes?.[defaultMode]?.tokens ?? {};
    const catalog = JSON.parse(
      fs.readFileSync(path.join(dir, profile.catalog.files.products), "utf8"),
    );

    return {
      id,
      brand: profile.brand?.name ?? id,
      tagline: profile.brand?.tagline ?? "",
      vertical: profile.vertical ?? "",
      defaultMode,
      radius: profile.theme?.radius ?? "",
      swatch: [
        tokens["--background"],
        tokens["--foreground"],
        tokens["--primary"],
        tokens["--link"] ?? tokens["--ring"],
      ].filter(Boolean),
      products: catalog.length,
      variants: catalog.reduce((n, p) => n + (p.variants?.length ?? 0), 0),
      locales: profile.locale?.catalogLocales ?? [],
      stands: [],
    };
  });

const byId = new Map(profiles.map((profile) => [profile.id, profile]));

// ── stands: what is actually running on this machine ────────────────────────
const ports = listeners();
const roots = new Map(); // worktree root -> { storefront, backend }

for (const [port, pid] of ports) {
  const cwd = cwdOf(pid);
  const match = /^(.*)\/apps\/(storefront|backend)$/.exec(cwd);
  if (!match) continue;
  const [, root, app] = match;
  if (!fs.existsSync(path.join(root, "apps/backend/src/migration-scripts")))
    continue;

  const entry = roots.get(root) ?? { root, storefront: null, backend: null };
  entry[app] = { port: Number(port), pid: Number(pid) };
  roots.set(root, entry);
}

const stands = [];
for (const entry of roots.values()) {
  const backendEnv = {
    ...readEnv(path.join(entry.root, "apps/backend/.env")),
    ...(entry.backend
      ? envOf(entry.backend.pid, ["DATABASE_URL", "PORT", "STORE_PROFILE", "DB_NAME"])
      : {}),
  };
  const frontEnv = {
    ...readEnv(path.join(entry.root, "apps/storefront/.env")),
    ...readEnv(path.join(entry.root, "apps/storefront/.env.local")),
    ...(entry.storefront
      ? envOf(entry.storefront.pid, ["NEXT_PUBLIC_STORE_PROFILE", "NEXT_PUBLIC_MEDUSA_BACKEND_URL"])
      : {}),
  };

  const profileId =
    frontEnv.NEXT_PUBLIC_STORE_PROFILE ?? backendEnv.STORE_PROFILE ?? null;
  const database = databaseName(backendEnv.DATABASE_URL ?? "");
  const backendPort = entry.backend?.port ?? (Number(backendEnv.PORT) || null);

  const stand = {
    root: entry.root,
    worktree: path.relative(
      path.join(REPO, "..", "..", "worktrees", "upready-store"),
      entry.root,
    ),
    isMain: entry.root === REPO,
    profileId,
    database,
    databaseUrl: backendEnv.DATABASE_URL ?? "",
    storefront: entry.storefront,
    backend: entry.backend ? { ...entry.backend } : null,
    backendPort,
    storefrontStatus: null,
    backendStatus: null,
  };

  if (stand.storefront) {
    stand.storefrontUrl = `http://localhost:${stand.storefront.port}/en`;
    stand.storefrontStatus = probe(stand.storefrontUrl);
  }
  if (stand.backend) {
    stand.backendUrl = `http://localhost:${stand.backend.port}`;
    stand.backendStatus = probe(`${stand.backendUrl}/health`);
  }

  const profile = profileId ? byId.get(profileId) : null;
  if (profile) profile.stands.push(stand);
  stands.push(stand);
}

// ── the shared database (variant A): one database, two profiles ─────────────
const sharedStands = stands.filter((stand) => {
  if (!stand.databaseUrl) return false;
  const channels = (() => {
    try {
      return Number(
        execFileSync(
          PSQL,
          [stand.databaseUrl, "-tAc",
           "SELECT count(*) FROM sales_channel WHERE deleted_at IS NULL"],
          { encoding: "utf8" },
        ).trim(),
      );
    } catch {
      return 0;
    }
  })();
  stand.channelCount = channels;
  return channels > 1;
});

for (const stand of sharedStands) {
  try {
    const rows = execFileSync(
      PSQL,
      [stand.databaseUrl, "-tAc",
       `SELECT sc.name || '|' || k.token || '|' ||
               (SELECT count(*) FROM product_sales_channel psc
                 WHERE psc.sales_channel_id = sc.id AND psc.deleted_at IS NULL)
          FROM sales_channel sc
          JOIN publishable_api_key_sales_channel l ON l.sales_channel_id = sc.id
          JOIN api_key k ON k.id = l.publishable_key_id
         WHERE sc.deleted_at IS NULL AND k.revoked_at IS NULL
         ORDER BY sc.created_at`],
      { encoding: "utf8" },
    ).trim();
    stand.channels = rows
      ? rows.split("\n").map((row) => {
          const [name, token, products] = row.split("|");
          return { name, token, products: Number(products) };
        })
      : [];
  } catch {
    stand.channels = [];
  }
}

for (const profile of profiles) {
  for (const stand of profile.stands) {
    const channelName = `${profile.brand} Sales Channel`;
    stand.seeded = stand.databaseUrl
      ? productCount(stand.databaseUrl, stand.channelCount > 1 ? channelName : null)
      : null;
  }
}

// ── render ──────────────────────────────────────────────────────────────────
const esc = (value) =>
  String(value ?? "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch],
  );

const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

const plural = (n, one, few, many) => {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const isLive = (profile) => {
  const stand = profile.stands[0];
  if (!stand) return false;
  return (
    (stand.storefrontStatus !== null && stand.storefrontStatus < 400) ||
    (stand.backendStatus !== null && stand.backendStatus < 400)
  );
};

const running = profiles.filter(isLive).length;

const dot = (ok) =>
  `<span class="dot ${ok ? "green" : "red"}"></span>`;

const statusLine = (label, url, code, kind) => {
  const ok = code !== null && code < 400;
  return `<div class="line" data-probe="${esc(url ?? "")}" data-kind="${kind}">
      ${dot(ok)}
      <span class="line-label">${esc(label)}</span>
      ${url ? `<a class="line-url mono" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(url.replace("http://", ""))}</a>` : `<span class="line-url mono faint">не запущен</span>`}
      <span class="code mono">${code === null ? "—" : code}</span>
    </div>`;
};

const profileCard = (profile) => {
  const stand = profile.stands[0] ?? null;
  const live = isLive(profile);

  return `<article class="card${live ? "" : " card-off"}">
    <header class="card-head">
      <div class="swatch" title="палитра темы в режиме по умолчанию">
        ${profile.swatch.map((c) => `<i style="background:${esc(c)}"></i>`).join("")}
      </div>
      <div class="card-title">
        <div class="eyebrow">${esc(profile.id)}</div>
        <h2>${esc(profile.brand)}</h2>
        <p class="tagline">${esc(profile.tagline)}</p>
      </div>
      <div class="state">${dot(!!live)}<span>${live ? "запущен" : "не запущен"}</span></div>
    </header>

    <div class="lines">
      ${stand
        ? statusLine("витрина", stand.storefrontUrl, stand.storefrontStatus, "storefront") +
          statusLine("бэкенд", stand.backendUrl ? `${stand.backendUrl}/health` : null, stand.backendStatus, "backend") +
          (stand.backendUrl
            ? `<div class="line"><span class="dot ghost"></span><span class="line-label">админка</span><a class="line-url mono" href="${esc(stand.backendUrl)}/app" target="_blank" rel="noreferrer">${esc(stand.backendUrl.replace("http://", ""))}/app</a><span class="code mono">—</span></div>`
            : "")
        : `<div class="line"><span class="dot red"></span><span class="line-label">стенд</span><span class="line-url faint">процесса нет — тема существует только в репозитории</span><span class="code mono">—</span></div>`}
    </div>

    <dl class="facts mono">
      <div><dt>вертикаль</dt><dd>${esc(profile.vertical)}</dd></div>
      <div><dt>режим темы</dt><dd>${esc(profile.defaultMode)}${profile.radius ? ` · radius ${esc(profile.radius)}` : ""}</dd></div>
      <div><dt>каталог</dt><dd>${profile.products} товаров · ${profile.variants} вариантов${
        stand?.seeded !== null && stand?.seeded !== undefined
          ? ` · в базе ${stand.seeded}`
          : ""
      }</dd></div>
      <div><dt>локали</dt><dd>${esc(profile.locales.join(" "))}</dd></div>
      ${stand ? `<div><dt>база</dt><dd>${esc(stand.database || "—")}</dd></div>` : ""}
      ${stand ? `<div><dt>worktree</dt><dd>${esc(stand.isMain ? "projects/upready-store (основной)" : stand.worktree)}</dd></div>` : ""}
    </dl>
  </article>`;
};

const sharedSection = (stand) => `
  <section class="shared">
    <div class="eyebrow">одна база — два профиля (вариант A)</div>
    <h2>${esc(stand.database)}</h2>
    <p class="note">Один store, 241 регион, 241 stock location и общий fulfillment на всех;
      каждый профиль приносит свой sales channel, ключ и каталог. Изоляция каталога —
      по publishable key.</p>
    <div class="lines">
      ${statusLine("бэкенд", stand.backendUrl ? `${stand.backendUrl}/health` : null, stand.backendStatus, "backend")}
      <div class="line"><span class="dot ghost"></span><span class="line-label">витрина</span><span class="line-url faint">не поднята — база измеряется curl'ом</span><span class="code mono">—</span></div>
    </div>
    <table class="keys mono">
      <thead><tr><th>sales channel</th><th>publishable key</th><th class="num">товаров</th></tr></thead>
      <tbody>
        ${(stand.channels ?? [])
          .map(
            (channel) => `<tr>
          <td>${esc(channel.name)}</td>
          <td class="token">${esc(channel.token)}</td>
          <td class="num">${channel.products}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>`;

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Стенды store-profiles</title>
<link rel="stylesheet" href="tokens.css">
<style>
  body { margin:0; padding:32px 24px 72px; }
  .wrap { max-width:1180px; margin:0 auto; }

  header.page { display:flex; align-items:flex-start; gap:16px; margin:0 0 6px; }
  header.page h1 { font:500 22px/1.2 var(--sans); letter-spacing:-.02em; margin:0; }
  header.page .grow { flex:1; }
  .sub { color:var(--muted); margin:6px 0 0; max-width:70ch; }
  .stamp { color:var(--faint); font-family:var(--mono); font-size:12px;
           font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; }
  .stamp .summary { color:var(--fg); font-size:13px; margin-bottom:3px; }

  .toolbar { display:flex; align-items:center; gap:8px; margin:22px 0 18px;
             padding-bottom:14px; border-bottom:1px solid var(--border); }
  button { font:500 13px/1 var(--sans); color:var(--bg); background:var(--fg);
           border:0; border-radius:var(--r-sm); padding:8px 12px; cursor:pointer; }
  button:hover { background:var(--fg-hover); }
  button.ghost { background:transparent; color:var(--fg); border:1px solid var(--border); }
  button.ghost:hover { background:var(--hover); }
  .toolbar .hint { color:var(--faint); font-size:12px; margin-left:auto; }

  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:14px; }

  .card { border:1px solid var(--border); border-radius:var(--r-md); background:var(--elev);
          padding:16px 16px 14px; display:flex; flex-direction:column; gap:14px; }
  .card-off { background:var(--bg); }
  .card-head { display:flex; gap:12px; align-items:flex-start; }
  .swatch { display:grid; grid-template-columns:repeat(2,11px); grid-auto-rows:11px; gap:2px;
            border:1px solid var(--border); border-radius:4px; padding:3px; flex-shrink:0; }
  .swatch i { display:block; border-radius:2px; }
  .card-title { flex:1; min-width:0; }
  .card-title h2 { font:500 16px/1.25 var(--sans); letter-spacing:-.01em; margin:3px 0 0; }
  .tagline { color:var(--faint); font-size:12px; margin:3px 0 0; }
  .state { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted);
           white-space:nowrap; }

  .lines { display:flex; flex-direction:column; gap:6px; }
  .line { display:flex; align-items:center; gap:8px; font-size:13px; }
  .line-label { color:var(--faint); width:58px; flex-shrink:0; }
  .line-url { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
              font-size:12px; }
  a { color:var(--link); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .faint { color:var(--faint); }
  .code { color:var(--faint); font-size:11px; font-variant-numeric:tabular-nums; }
  .dot.ghost { background:var(--border); }

  .facts { margin:0; border-top:1px solid var(--border); padding-top:11px;
           font-size:12px; font-variant-numeric:tabular-nums; }
  .facts > div { display:flex; gap:10px; padding:2px 0; }
  .facts dt { color:var(--faint); width:84px; flex-shrink:0; }
  .facts dd { margin:0; color:var(--muted); min-width:0; word-break:break-word; }

  .shared { margin:26px 0 0; border:1px solid var(--border); border-radius:var(--r-md);
            padding:18px 18px 8px; background:var(--elev); }
  .shared h2 { font:500 16px/1.25 var(--mono); letter-spacing:-.01em; margin:6px 0 0; }
  .note { color:var(--muted); font-size:13px; max-width:80ch; margin:8px 0 14px; }
  table.keys { width:100%; border-collapse:collapse; font-size:12px;
               font-variant-numeric:tabular-nums; margin:12px 0 10px; }
  table.keys th { text-align:left; font-weight:500; color:var(--faint); font-size:10px;
                  letter-spacing:.08em; text-transform:uppercase; padding:0 10px 7px 0;
                  border-bottom:1px solid var(--border); }
  table.keys td { padding:8px 10px 8px 0; border-bottom:1px solid var(--border);
                  color:var(--muted); }
  table.keys .token { color:var(--faint); word-break:break-all; }
  table.keys .num { text-align:right; padding-right:0; color:var(--fg); }

  footer { margin:28px 0 0; padding-top:14px; border-top:1px solid var(--border);
           color:var(--faint); font-size:12px; max-width:80ch; }
  footer code { background:var(--code-bg); color:var(--code-fg); padding:1px 5px;
                border-radius:4px; font-size:11px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <div class="grow">
      <div class="eyebrow">upready-store · t-store-profiles-pilot</div>
      <h1>Стенды store-profiles</h1>
      <p class="sub">${profiles.length} тем${plural(profiles.length, "а", "ы", "")} магазина, собранн${plural(profiles.length, "ая", "ые", "ых")} из профилей репозитория, и стенды,
        на которых они подняты. Статус измерен на момент сборки страницы; кнопка ниже
        перепроверяет его вживую из браузера.</p>
    </div>
    <div class="stamp">
      <div class="summary">${running} из ${profiles.length} запущено</div>
      собрано ${esc(stamp)}
    </div>
  </header>

  <div class="toolbar">
    <button id="recheck" type="button">перепроверить сейчас</button>
    <button class="ghost" id="theme" type="button">светлая тема</button>
    <span class="hint" id="hint">живая проверка идёт из file:// — браузер может её заблокировать</span>
  </div>

  <div class="grid">
    ${profiles.map(profileCard).join("\n")}
  </div>

  ${sharedStands.map(sharedSection).join("\n")}

  <footer>
    Страница генерируется: <code>node artifacts/docs/stands/build.mjs</code>.
    Стенды не описаны в конфиге — они находятся по слушающим портам и рабочим
    каталогам процессов, поэтому остановленный стенд честно показывается
    остановленным. Поднять витрину заново:
    <code>cd &lt;worktree&gt;/apps/storefront &amp;&amp; node scripts/build-profile.mjs &amp;&amp; npx next dev --turbopack -p &lt;порт&gt;</code>,
    бэкенд — <code>pnpm dev</code> из <code>apps/backend</code> того же worktree.
  </footer>
</div>

<script>
  // Live re-check from the page itself. A no-cors request cannot be READ, but it
  // resolves when the server answered and rejects when nothing is listening —
  // which is exactly the one bit this page needs. A browser that blocks the
  // whole request (file:// origin, private-network policy) rejects everything,
  // so the failure is reported as "проверка заблокирована", never as "стенд лёг".
  const lines = () => Array.from(document.querySelectorAll("[data-probe]"))
    .filter((el) => el.dataset.probe);

  async function recheck() {
    const hint = document.getElementById("hint");
    hint.textContent = "проверяю…";
    let ok = 0, failed = 0;
    await Promise.all(lines().map(async (el) => {
      const dot = el.querySelector(".dot");
      try {
        await fetch(el.dataset.probe, { mode: "no-cors", cache: "no-store" });
        dot.classList.remove("red"); dot.classList.add("green");
        el.querySelector(".code").textContent = "live";
        ok += 1;
      } catch {
        dot.classList.remove("green"); dot.classList.add("red");
        el.querySelector(".code").textContent = "—";
        failed += 1;
      }
    }));
    hint.textContent = failed === lines().length
      ? "ни один адрес не ответил — вероятно, браузер заблокировал проверку из file://"
      : \`перепроверено: \${ok} отвечает, \${failed} нет · \${new Date().toLocaleTimeString()}\`;
  }

  document.getElementById("recheck").addEventListener("click", recheck);

  const root = document.documentElement;
  const themeButton = document.getElementById("theme");
  const applyTheme = (light) => {
    root.classList.toggle("light", light);
    themeButton.textContent = light ? "тёмная тема" : "светлая тема";
  };
  try { applyTheme(localStorage.getItem("stands.theme") === "light"); } catch { applyTheme(false); }
  themeButton.addEventListener("click", () => {
    const light = !root.classList.contains("light");
    applyTheme(light);
    try { localStorage.setItem("stands.theme", light ? "light" : "dark"); } catch {}
  });
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, "index.html"), html);

console.log(`profiles: ${profiles.length}`);
for (const profile of profiles) {
  const stand = profile.stands[0];
  console.log(
    `  ${profile.id.padEnd(16)} ${stand ? `storefront=${stand.storefront?.port ?? "-"}(${stand.storefrontStatus ?? "-"}) backend=${stand.backend?.port ?? "-"}(${stand.backendStatus ?? "-"}) db=${stand.database} seeded=${stand.seeded ?? "-"}` : "no stand running"}`,
  );
}
for (const stand of sharedStands) {
  console.log(
    `  shared ${stand.database}: ${(stand.channels ?? []).map((c) => `${c.name}=${c.products}`).join(", ")}`,
  );
}
console.log(`wrote ${path.join(HERE, "index.html")}`);
