/** Читаемое тело: ссылки→текст. node scripts/body.mjs <path> [--from <regex>] [--n 80] [--skip N] */
import { readFileSync } from "node:fs"
const a = process.argv.slice(2)
const p = a[0]
const fromRe = a.includes("--from") ? new RegExp(a[a.indexOf("--from") + 1], "i") : null
const n = Number(a[a.indexOf("--n") + 1]) || 80
const skip = Number(a[a.indexOf("--skip") + 1]) || 0
const t = readFileSync(p, "utf8")
const body = t.slice(t.indexOf("## Текст страницы"))
const lines = body.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").split("\n").map((l) => l.trim()).filter((l) => l.length > 2)
let start = 0
if (fromRe) { const i = lines.findIndex((l) => fromRe.test(l)); if (i >= 0) start = i }
console.log(lines.slice(start + skip, start + skip + n).join("\n"))
