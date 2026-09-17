#!/usr/bin/env node
// Validator for glossary/*.md. No dependencies (node:fs/node:path/node:url only).
// Checks the schema, that every used_in path exists AND is a file (not a
// directory), that term_en literally occurs in the source file, that index.md
// lists exactly the entries on disk, and that the repo root is found by
// walking up for package.json rather than a hardcoded absolute fallback.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const findRepoRoot = (start) => {
  let dir = start;
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not find repo root (no pnpm-workspace.yaml found walking up from " + start + ")");
};

const REPO_ROOT = findRepoRoot(HERE);
const GLOSSARY_DIR = HERE;

const errors = [];
const fail = (msg) => errors.push(msg);

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const REQUIRED_SCALAR_FIELDS = ["id", "term_ru", "term_en", "short", "status", "source"];
const REQUIRED_LIST_FIELDS = ["used_in", "related"];
const VALID_STATUSES = new Set(["кандидат", "устоялось"]);

function parseFrontmatter(text, file) {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    fail(`${file}: no YAML frontmatter block (--- ... ---) found`);
    return null;
  }
  const [, fm, body] = m;
  const data = {};
  let currentListKey = null;
  for (const rawLine of fm.split("\n")) {
    if (rawLine.trim() === "") continue;
    const listItem = /^\s*-\s+(.+)$/.exec(rawLine);
    if (listItem) {
      if (!currentListKey) {
        fail(`${file}: list item with no preceding "key:" line: ${rawLine}`);
        continue;
      }
      data[currentListKey].push(listItem[1].trim());
      continue;
    }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(rawLine);
    if (!kv) {
      fail(`${file}: unparseable frontmatter line: ${rawLine}`);
      continue;
    }
    const [, key, rest] = kv;
    if (rest === "") {
      data[key] = [];
      currentListKey = key;
    } else {
      currentListKey = null;
      data[key] = rest.replace(/^"(.*)"$/, "$1");
    }
  }
  return { data, body };
}

const files = fs
  .readdirSync(GLOSSARY_DIR)
  .filter((f) => f.endsWith(".md") && f !== "index.md")
  .sort();

if (files.length < 40) {
  fail(`only ${files.length} entries found, brief requires >= 40`);
}

const seenIds = new Set();

for (const file of files) {
  const full = path.join(GLOSSARY_DIR, file);
  const text = fs.readFileSync(full, "utf8");
  const parsed = parseFrontmatter(text, file);
  if (!parsed) continue;
  const { data } = parsed;

  const expectedId = file.replace(/\.md$/, "");
  if (data.id !== expectedId) {
    fail(`${file}: id "${data.id}" does not match filename (expected "${expectedId}")`);
  }
  if (seenIds.has(data.id)) {
    fail(`${file}: duplicate id "${data.id}"`);
  }
  seenIds.add(data.id);

  for (const field of REQUIRED_SCALAR_FIELDS) {
    if (!data[field] || typeof data[field] !== "string" || data[field].trim() === "") {
      fail(`${file}: missing or empty required field "${field}"`);
    }
  }
  for (const field of REQUIRED_LIST_FIELDS) {
    if (!Array.isArray(data[field]) || data[field].length === 0) {
      fail(`${file}: missing or empty required list field "${field}"`);
    }
  }

  if (typeof data.short === "string" && data.short.length > 160) {
    fail(`${file}: short definition is ${data.short.length} chars, limit is 160`);
  }

  if (data.status && !VALID_STATUSES.has(data.status)) {
    fail(`${file}: status "${data.status}" is not one of кандидат|устоялось`);
  }

  // used_in: every path must exist AND be a FILE, never a directory.
  if (Array.isArray(data.used_in)) {
    for (const rel of data.used_in) {
      const abs = path.join(REPO_ROOT, rel);
      if (!fs.existsSync(abs)) {
        fail(`${file}: used_in path does not exist: ${rel}`);
        continue;
      }
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        fail(`${file}: used_in path is a DIRECTORY, not a place of use: ${rel}`);
      }
    }
  }

  // source: must exist, be a file, and literally contain term_en (any of the
  // snake/camel/kebab-insensitive forms is NOT accepted — the exact string
  // written in term_en must appear, so a made-up identifier cannot pass).
  if (data.source && data.term_en) {
    const abs = path.join(REPO_ROOT, data.source);
    if (!fs.existsSync(abs)) {
      fail(`${file}: source path does not exist: ${data.source}`);
    } else if (fs.statSync(abs).isDirectory()) {
      fail(`${file}: source path is a directory, not a file: ${data.source}`);
    } else {
      const content = fs.readFileSync(abs, "utf8");
      if (!content.includes(data.term_en)) {
        fail(`${file}: term_en "${data.term_en}" not found literally in source ${data.source}`);
      }
    }
  }

  // related: every id must resolve to an existing entry (checked after the loop).
}

// related ids must point to real entries
for (const file of files) {
  const text = fs.readFileSync(path.join(GLOSSARY_DIR, file), "utf8");
  const parsed = parseFrontmatter(text, file);
  if (!parsed) continue;
  const { data } = parsed;
  if (Array.isArray(data.related)) {
    for (const rid of data.related) {
      if (!seenIds.has(rid) && !files.includes(`${rid}.md`)) {
        fail(`${file}: related id "${rid}" has no matching glossary/${rid}.md`);
      }
    }
  }
}

// index.md must list exactly the ids on disk (sync check).
const indexPath = path.join(GLOSSARY_DIR, "index.md");
if (!fs.existsSync(indexPath)) {
  fail("index.md is missing");
} else {
  const indexText = fs.readFileSync(indexPath, "utf8");
  const idsInIndex = new Set(
    Array.from(indexText.matchAll(/\[([0-9a-z-]+)\]\(\.\/\1\.md\)/g)).map((m) => m[1]),
  );
  for (const id of seenIds) {
    if (!idsInIndex.has(id)) fail(`index.md: missing a row for "${id}"`);
  }
  for (const id of idsInIndex) {
    if (!seenIds.has(id)) fail(`index.md: lists "${id}" but glossary/${id}.md does not exist`);
  }
}

if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(`OK: ${files.length} entries, all fields present, all used_in/source paths are real files, term_en verified in source, index.md in sync.`);
process.exit(0);
