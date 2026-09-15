const fs = require("node:fs");
const [, , src, out] = process.argv;
const lines = fs.readFileSync(src, "utf8").split("\n");
const VERBS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const rows = [];
for (let i = 0; i < lines.length; i += 1) {
  const v = lines[i].trim();
  if (!VERBS.has(v)) continue;
  const p = (lines[i + 1] || "").trim();
  if (!p.startsWith("/v")) continue;
  // summary = nearest previous non-empty line
  let s = "";
  for (let j = i - 1; j >= 0 && j > i - 6; j -= 1) {
    const c = lines[j].trim();
    if (c) { s = c; break; }
  }
  // description = first substantial line after the "Описание и примеры" marker
  let d = "";
  for (let j = i + 2; j < i + 14 && j < lines.length; j += 1) {
    const c = lines[j].trim();
    if (!c || /^Описание и примеры/.test(c) || c === "Консоль") continue;
    if (/^(HEADER|QUERY|PATH|REQUEST|RESPONSES|Request Body)/i.test(c)) break;
    d = c; break;
  }
  rows.push({ method: v, path: p, summary: s, desc: d.slice(0, 300) });
}
const seen = new Set();
const uniq = rows.filter((r) => {
  const k = `${r.method} ${r.path}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
uniq.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
fs.writeFileSync(
  out,
  `# Ozon Seller API — method index extracted from the saved page ${src.split("/").pop()}\n` +
    `# Columns: METHOD\\tPATH\\tSUMMARY\\tFIRST LINE OF DESCRIPTION\n` +
    uniq.map((r) => [r.method, r.path, r.summary, r.desc].join("\t")).join("\n") + "\n",
);
console.log("methods:", uniq.length);
const byVerb = {};
uniq.forEach((r) => { byVerb[r.method] = (byVerb[r.method] || 0) + 1; });
console.log("by verb:", JSON.stringify(byVerb));
const groups = {};
uniq.forEach((r) => {
  const g = r.path.split("/").slice(1, 3).join("/");
  groups[g] = (groups[g] || 0) + 1;
});
console.log("groups:", Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([k,v])=>`${k}:${v}`).join(" "));
