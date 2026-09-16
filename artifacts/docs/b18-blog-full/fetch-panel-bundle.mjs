// b18-blog-full, этап 0: что реально лежит в ЖИВОМ бандле панели.
// Тянем index.html, все его модули и все чанки, на которые они ссылаются
// (Vite пишет ленивые чанки как строки "assets/xxx.js" внутри родителя),
// и ищем маркерные строки экранов журнала.
const BASE = process.argv[2] || "https://panel-store.upready.dev";
const OUT = process.argv[3];
const fs = await import("node:fs/promises");

const seen = new Set();
const bodies = new Map();

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": "b18-diagnostic" } });
  return { status: res.status, text: res.ok ? await res.text() : "" };
}

const index = await get(BASE + "/");
console.log("index.html:", index.status, index.text.length, "bytes");

const queue = [];
for (const m of index.text.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) queue.push(m[1]);
console.log("entry chunks in index.html:", queue.length, queue.join(" "));

while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  const r = await get(BASE + path);
  if (r.status !== 200) { console.log("  !!", path, r.status); continue; }
  bodies.set(path, r.text);
  for (const m of r.text.matchAll(/["'`](?:\.\/|\/)?(assets\/[A-Za-z0-9_.\-]+\.js)["'`]/g)) {
    const p = "/" + m[1];
    if (!seen.has(p)) queue.push(p);
  }
}
const total = [...bodies.values()].reduce((a, b) => a + b.length, 0);
console.log("chunks fetched:", bodies.size, "total bytes:", total);

const MARKERS = [
  ["список: заголовок раздела", "Журнал"],
  ["список: поле адреса", "Адрес статьи"],
  ["список: колонка Публичный адрес", "Публичный адрес"],
  ["список: кнопка", "Новая статья"],
  ["редактор: подпись языка", "Текст на языке"],
  ["редактор: поле Обложка", "Обложка"],
  ["редактор: поле Метки", "Метки"],
  ["редактор: SEO-заголовок", "SEO-заголовок"],
  ["редактор: подсказка markdown", "выделенная врезка"],
  ["редактор: переключатель Опубликована", "Опубликована"],
  ["удаление: подтверждение", "Удалить статью?"],
  ["страницы (для контроля): редактор страниц", "Содержимое страницы"],
];
const lines = [];
for (const [label, needle] of MARKERS) {
  const hits = [...bodies.entries()].filter(([, b]) => b.includes(needle)).map(([p]) => p);
  lines.push(`${hits.length ? "ЕСТЬ " : "НЕТ  "} | ${label} | «${needle}» | ${hits.join(", ") || "-"}`);
}
console.log(lines.join("\n"));

if (OUT) {
  await fs.mkdir(OUT, { recursive: true });
  for (const [p, b] of bodies) await fs.writeFile(OUT + "/" + p.split("/").pop(), b);
  await fs.writeFile(OUT + "/index.html", index.text);
  console.log("saved to", OUT);
}
