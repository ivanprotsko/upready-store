// Pre-applies the owner's edits (old shop `translation` table, resource='review')
// onto the two source JSON files, so the import can run INSIDE the live
// mt-backend container, which has no route to the old shop's database on this
// laptop. The rule is the one the import script itself applies:
//   author = edit?.author ?? base.author ; text = edit?.text ?? base.text
// The overlay is read as ONE json_agg blob, never as newline-separated text:
// a review body carries newlines of its own.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DATA = "/Users/ivanprotsko/upready/projects/chrxnasdmds/apps/storefront/src/lib/data";
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: merge-overlay.mjs <out-dir>");
fs.mkdirSync(OUT, { recursive: true });

const PSQL = "/opt/homebrew/opt/postgresql@17/bin/psql";
const DSN = "postgres://ivanprotsko@127.0.0.1:5433/medusa_chrxn";
const SQL =
  "select coalesce(json_agg(json_build_object('k',resource_key,'f',field,'l',locale,'v',value)), '[]'::json)" +
  " from translation where resource='review' and deleted_at is null and locale in ('ru','en')";

const blob = execFileSync(PSQL, [DSN, "-At", "-c", SQL], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const rows = JSON.parse(blob);
if (!rows.length) throw new Error("translation table returned zero rows for resource='review'");

const overlay = { ru: new Map(), en: new Map() };
for (const r of rows) {
  const m = overlay[r.l];
  if (!m) continue;
  const e = m.get(r.k) ?? {};
  if (r.f === "author") e.author = r.v;
  if (r.f === "text") e.text = r.v;
  m.set(r.k, e);
}

const stats = {};
for (const [locale, file] of [
  ["ru", "reviews-data.json"],
  ["en", "reviews-data.en.json"],
]) {
  const src = JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"));
  let hits = 0;
  let differs = 0;
  const changed = [];
  const merged = src.map((review) => {
    const edit = overlay[locale].get(String(review.id));
    if (!edit || (!edit.author && !edit.text)) return review;
    hits += 1;
    const authorDiff = Boolean(edit.author) && edit.author !== review.author;
    const textDiff = Boolean(edit.text) && edit.text !== review.text;
    if (authorDiff || textDiff) {
      differs += 1;
      changed.push({
        id: review.id,
        author_file: review.author,
        author_db: edit.author,
        text_changed: textDiff,
        text_file_len: (review.text ?? "").length,
        text_db_len: (edit.text ?? "").length,
      });
    }
    return { ...review, author: edit.author ?? review.author, text: edit.text ?? review.text };
  });
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(merged, null, 2));
  stats[locale] = { reviews: src.length, overlay_hits: hits, overlay_differs: differs, changed };
}

fs.writeFileSync(path.join(OUT, "overlay-stats.json"), JSON.stringify(stats, null, 2));
console.log(
  JSON.stringify(
    {
      translation_rows: rows.length,
      ru: { reviews: stats.ru.reviews, hits: stats.ru.overlay_hits, differs: stats.ru.overlay_differs },
      en: { reviews: stats.en.reviews, hits: stats.en.overlay_hits, differs: stats.en.overlay_differs },
    },
    null,
    2,
  ),
);
