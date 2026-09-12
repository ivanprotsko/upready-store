import json

with open("pages.json", "r", encoding="utf-8") as f:
    data = json.load(f)

json_blob = json.dumps(data, ensure_ascii=False).replace("</script", "<\\/script")

html = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Навигация: inSales vs Shopify</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 860px; margin: 0 auto; padding: 32px 20px 80px; line-height: 1.45; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 20px; }
  .toggle { display: inline-flex; border: 1px solid #ccc; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .toggle button { border: none; background: #f4f4f4; padding: 8px 18px; font-size: 14px; cursor: pointer; }
  .toggle button.active { background: #111; color: #fff; }
  .count { color: #888; font-size: 13px; margin-bottom: 16px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 14px 0; border-bottom: 1px solid #e5e5e5; }
  li a { font-size: 16px; font-weight: 600; text-decoration: none; color: #0b5fff; }
  li a:hover { text-decoration: underline; }
  li .url { display: block; font-size: 12px; color: #999; margin-top: 2px; word-break: break-all; }
  li p { margin: 6px 0 0; font-size: 14px; color: #333; }
  li p.empty { color: #b00; font-style: italic; }
</style>
</head>
<body>
<h1>Навигация в хедере и футере: inSales vs Shopify</h1>
<div class="sub">Ссылки собраны 2026-09-12 из header/footer nav обоих сайтов, дедуплицированы; title/description/keywords взяты с самих целевых страниц.</div>
<div class="toggle">
  <button id="btn-insales" class="active" onclick="show('insales')">inSales (__N_INSALES__)</button>
  <button id="btn-shopify" onclick="show('shopify')">Shopify (__N_SHOPIFY__)</button>
</div>
<div class="count" id="count"></div>
<ul id="list"></ul>
<script>
const DATA = __JSON__;
function esc(s){ const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function show(source){
  document.getElementById('btn-insales').classList.toggle('active', source === 'insales');
  document.getElementById('btn-shopify').classList.toggle('active', source === 'shopify');
  const items = DATA[source];
  document.getElementById('count').textContent = items.length + ' страниц';
  const ul = document.getElementById('list');
  ul.innerHTML = items.map(function(p) {
    const title = p.title ? esc(p.title) : '(страница недоступна для скрапинга — 403/бот-защита или битая ссылка)';
    const desc = p.description ? '<p>' + esc(p.description) + '</p>' : '<p class="empty">description отсутствует</p>';
    return '<li><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + title + '</a><span class="url">' + esc(p.url) + '</span>' + desc + '</li>';
  }).join('');
}
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
