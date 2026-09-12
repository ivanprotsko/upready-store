import json

with open("pages.json", "r", encoding="utf-8") as f:
    data = json.load(f)

json_blob = json.dumps(data, ensure_ascii=False).replace("</script", "<\\/script")

html = """<!doctype html>
<html lang="ru" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Навигация: inSales vs Shopify</title>
<style>
  /* Светлая тема — значения по умолчанию */
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --fg: #111111;
    --muted: #666666;
    --faint: #8a8a8a;
    --line: #e5e5e5;
    --border: #cccccc;
    --link: #0b5fff;
    --chip-bg: #f4f4f4;
    --chip-fg: #333333;
    --chip-active-bg: #111111;
    --chip-active-fg: #ffffff;
    --warn: #b00020;
    --badge-bg: #fdecea;
    --badge-fg: #b00020;
  }
  /* Тёмная тема — явный выбор пользователя */
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #14171a;
    --fg: #e8eaed;
    --muted: #9aa0a6;
    --faint: #7c8388;
    --line: #2a2f35;
    --border: #3a4149;
    --link: #7aa7ff;
    --chip-bg: #1e242a;
    --chip-fg: #c8cdd3;
    --chip-active-bg: #e8eaed;
    --chip-active-fg: #14171a;
    --warn: #ff7b72;
    --badge-bg: #3a1f1d;
    --badge-fg: #ff9b93;
  }
  /* Авто — тёмная только если её просит система */
  @media (prefers-color-scheme: dark) {
    :root[data-theme="auto"] {
      color-scheme: dark;
      --bg: #14171a;
      --fg: #e8eaed;
      --muted: #9aa0a6;
      --faint: #7c8388;
      --line: #2a2f35;
      --border: #3a4149;
      --link: #7aa7ff;
      --chip-bg: #1e242a;
      --chip-fg: #c8cdd3;
      --chip-active-bg: #e8eaed;
      --chip-active-fg: #14171a;
      --warn: #ff7b72;
      --badge-bg: #3a1f1d;
      --badge-fg: #ff9b93;
    }
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 860px; margin: 0 auto; padding: 32px 20px 80px; line-height: 1.45;
    background: var(--bg); color: var(--fg);
  }
  h1 { font-size: 20px; margin-bottom: 4px; color: var(--fg); }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }

  .bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .toggle button {
    border: none; background: var(--chip-bg); color: var(--chip-fg);
    padding: 8px 18px; font-size: 14px; cursor: pointer; font: inherit; font-size: 14px;
  }
  .toggle button.active { background: var(--chip-active-bg); color: var(--chip-active-fg); }

  .themes { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .themes button {
    border: none; background: var(--chip-bg); color: var(--chip-fg);
    padding: 6px 12px; font-size: 12px; cursor: pointer; font-family: inherit;
  }
  .themes button.active { background: var(--chip-active-bg); color: var(--chip-active-fg); }

  .count { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 14px 0; border-bottom: 1px solid var(--line); }
  li a { font-size: 16px; font-weight: 600; text-decoration: none; color: var(--link); }
  li a:hover { text-decoration: underline; }
  li .url { display: block; font-size: 12px; color: var(--faint); margin-top: 2px; word-break: break-all; }
  li p { margin: 6px 0 0; font-size: 14px; color: var(--fg); }
  li p.empty { color: var(--warn); font-style: italic; }
  li .kw { display: block; margin-top: 6px; font-size: 12px; color: var(--faint); }
  .badge {
    display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 999px;
    font-size: 11px; font-weight: 600; vertical-align: middle;
    background: var(--badge-bg); color: var(--badge-fg);
  }
  .dead a { color: var(--muted); }
</style>
</head>
<body>
<h1>Навигация в хедере и футере: inSales vs Shopify</h1>
<div class="sub">Ссылки собраны 2026-09-12 из header/footer nav обоих сайтов, дедуплицированы; title/description/keywords взяты с самих целевых страниц.</div>

<div class="bar">
  <div class="toggle">
    <button id="btn-insales" class="active" onclick="show('insales')">inSales (__N_INSALES__)</button>
    <button id="btn-shopify" onclick="show('shopify')">Shopify (__N_SHOPIFY__)</button>
  </div>
  <div class="themes" role="group" aria-label="Тема оформления">
    <button id="th-light" onclick="setTheme('light')">Светлая</button>
    <button id="th-dark" onclick="setTheme('dark')">Тёмная</button>
    <button id="th-auto" onclick="setTheme('auto')">Авто</button>
  </div>
</div>

<div class="count" id="count"></div>
<ul id="list"></ul>
<script>
const DATA = __JSON__;

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ENT[c]; });
}

function plural(n) {
  const d100 = n % 100, d10 = n % 10;
  if (d100 >= 11 && d100 <= 14) return 'страниц';
  if (d10 === 1) return 'страница';
  if (d10 >= 2 && d10 <= 4) return 'страницы';
  return 'страниц';
}

// title вида "404 ошибка — страница не найдена" означает битую ссылку в самой навигации сайта,
// а не нашу ошибку сбора: помечаем явно, чтобы не читалось как обычная страница.
function isDead(p) {
  return /(^|\\s)404(\\s|$)|страница не найдена|not found/i.test(p.title || '');
}

function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  try { localStorage.setItem('nav-viewer-theme', mode); } catch (e) {}
  ['light', 'dark', 'auto'].forEach(function (m) {
    document.getElementById('th-' + m).classList.toggle('active', m === mode);
  });
}

function show(source) {
  document.getElementById('btn-insales').classList.toggle('active', source === 'insales');
  document.getElementById('btn-shopify').classList.toggle('active', source === 'shopify');
  const items = DATA[source];
  document.getElementById('count').textContent = items.length + ' ' + plural(items.length);
  document.getElementById('list').innerHTML = items.map(function (p) {
    const dead = isDead(p);
    const title = p.title
      ? esc(p.title)
      : '(страница недоступна для скрапинга \\u2014 403/бот-защита или битая ссылка)';
    const badge = dead ? '<span class="badge">битая ссылка</span>' : '';
    const desc = p.description
      ? '<p>' + esc(p.description) + '</p>'
      : '<p class="empty">description отсутствует</p>';
    const kw = p.keywords ? '<span class="kw">keywords: ' + esc(p.keywords) + '</span>' : '';
    return '<li' + (dead ? ' class="dead"' : '') + '>'
      + '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + title + '</a>' + badge
      + '<span class="url">' + esc(p.url) + '</span>'
      + desc + kw + '</li>';
  }).join('');
}

let saved = 'light';
try { saved = localStorage.getItem('nav-viewer-theme') || 'light'; } catch (e) {}
setTheme(saved);
show('insales');
</script>
</body>
</html>
"""

html = html.replace("__N_INSALES__", str(len(data["insales"])))
html = html.replace("__N_SHOPIFY__", str(len(data["shopify"])))
html = html.replace("__JSON__", json_blob)

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("written", len(html), "bytes")
