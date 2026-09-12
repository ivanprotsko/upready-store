#!/usr/bin/env node
/**
 * split-reference.mjs
 *
 * Reads apps/homepage/index.html (the legacy dc-runtime page, UNTOUCHED) and
 * writes, under port/reference/:
 *   - props.json       decoded data-props JSON, pretty-printed
 *   - dc-script.js     text content of the data-dc-script element
 *   - style.css        the <style> block from <helmet>
 *   - raw/<NN>-<slug>.html   each <section> in DOM order (§2 of the brief),
 *                            00-shell.html = the <nav> plus the <footer>
 *
 * Pure static HTML parsing, no browser involved. Never edits the legacy
 * file. Section boundaries are found with a small tag-balancing walker
 * (handles void elements, self-closing tags, and raw-text elements like
 * <script>/<style> so nothing downstream of a section leaks in).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT_DIR = path.resolve(__dirname, "..");
const LEGACY_HTML = path.resolve(PORT_DIR, "..", "index.html");
const REFERENCE_DIR = path.join(PORT_DIR, "reference");
const RAW_DIR = path.join(REFERENCE_DIR, "raw");

// §2 registry, DOM order. "shell" is handled separately (nav + footer).
const REGISTRY = [
  { slug: "hero" },
  { slug: "launch-artifact" },
  { slug: "social-proof" },
  { slug: "proof-full" },
  { slug: "proof-short" },
  { slug: "frame" },
  { slug: "included" },
  { slug: "operations" },
  { slug: "pricing" },
  { slug: "payments" },
  { slug: "delivery" },
  { slug: "showcase" },
  { slug: "faq" },
  { slug: "tariffs" },
  { slug: "final-cta" },
];

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

/** Find the index right after '>' that closes the opening tag starting at
 * `html[start] === '<'`, respecting quoted attribute values. Returns
 * { tagName, openEnd, selfClosed }. */
function readOpenTag(html, start) {
  if (html[start] !== "<") {
    throw new Error(`readOpenTag: expected '<' at ${start}`);
  }
  let i = start + 1;
  const nameStart = i;
  while (i < html.length && /[a-zA-Z0-9-]/.test(html[i])) i++;
  const tagName = html.slice(nameStart, i).toLowerCase();

  let inQuote = null;
  let k = i;
  while (k < html.length) {
    const c = html[k];
    if (inQuote) {
      if (c === inQuote) inQuote = null;
    } else if (c === '"' || c === "'") {
      inQuote = c;
    } else if (c === ">") {
      break;
    }
    k++;
  }
  const openEnd = k + 1;
  const selfClosed = html[k - 1] === "/";
  return { tagName, openEnd, selfClosed };
}

/** Given the index of the '<' that opens an element, return the index right
 * after the matching closing tag (exclusive end of the whole element). */
function findElementEnd(html, start) {
  const { tagName, openEnd, selfClosed } = readOpenTag(html, start);

  if (VOID_ELEMENTS.has(tagName) || selfClosed) {
    return openEnd;
  }

  if (RAW_TEXT_ELEMENTS.has(tagName)) {
    const closeTag = `</${tagName}>`;
    const idx = html.indexOf(closeTag, openEnd);
    if (idx === -1) throw new Error(`unterminated <${tagName}>`);
    return idx + closeTag.length;
  }

  let depth = 1;
  let pos = openEnd;
  const tagRe = /<(!--)?(\/?)([a-zA-Z][a-zA-Z0-9-]*)/g;

  while (depth > 0) {
    tagRe.lastIndex = pos;
    const m = tagRe.exec(html);
    if (!m) throw new Error(`unbalanced <${tagName}> starting at ${start}`);

    if (m[1] === "!--") {
      const endComment = html.indexOf("-->", m.index);
      if (endComment === -1) throw new Error("unterminated comment");
      pos = endComment + 3;
      continue;
    }

    const closing = m[2] === "/";
    const name = m[3].toLowerCase();

    // find end of this tag, respecting quotes
    let inQuote = null;
    let kk = tagRe.lastIndex;
    while (kk < html.length) {
      const c = html[kk];
      if (inQuote) {
        if (c === inQuote) inQuote = null;
      } else if (c === '"' || c === "'") {
        inQuote = c;
      } else if (c === ">") {
        break;
      }
      kk++;
    }
    const tagEnd = kk + 1;
    const selfClosed2 = html[kk - 1] === "/";

    if (name === tagName) {
      if (closing) {
        depth--;
        if (depth === 0) return tagEnd;
      } else if (!VOID_ELEMENTS.has(name) && !selfClosed2) {
        depth++;
      }
    } else if (RAW_TEXT_ELEMENTS.has(name) && !closing) {
      const closeTag = `</${name}>`;
      const idx = html.indexOf(closeTag, tagEnd);
      if (idx === -1) throw new Error(`unterminated <${name}>`);
      pos = idx + closeTag.length;
      continue;
    }
    pos = tagEnd;
  }
  throw new Error(`unreachable for <${tagName}>`);
}

function extractElement(html, openTagStart) {
  const end = findElementEnd(html, openTagStart);
  return html.slice(openTagStart, end);
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function main() {
  const html = readFileSync(LEGACY_HTML, "utf8");

  mkdirSync(RAW_DIR, { recursive: true });

  // --- style.css: the single <style> block in <helmet> ---
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!styleMatch) throw new Error("no <style> block found");
  writeFileSync(path.join(REFERENCE_DIR, "style.css"), styleMatch[1].trimEnd() + "\n");

  // --- data-dc-script tag: props.json + dc-script.js ---
  const scriptTagStart = html.indexOf('<script type="text/x-dc" data-dc-script');
  if (scriptTagStart === -1) throw new Error("no data-dc-script tag found");
  const { openEnd: scriptOpenEnd } = readOpenTag(html, scriptTagStart);
  const openTagText = html.slice(scriptTagStart, scriptOpenEnd);

  const propsMatch = openTagText.match(/data-props="([\s\S]*?)"(?:\s|>)/);
  if (!propsMatch) throw new Error("no data-props attribute found");
  const propsJson = JSON.parse(decodeHtmlEntities(propsMatch[1]));
  writeFileSync(path.join(REFERENCE_DIR, "props.json"), JSON.stringify(propsJson, null, 2) + "\n");

  const scriptCloseIdx = html.indexOf("</script>", scriptOpenEnd);
  if (scriptCloseIdx === -1) throw new Error("unterminated data-dc-script tag");
  const dcScriptText = html.slice(scriptOpenEnd, scriptCloseIdx);
  writeFileSync(path.join(REFERENCE_DIR, "dc-script.js"), dcScriptText.replace(/^\n/, ""));

  // --- 00-shell.html: literal <nav> + literal <footer> ---
  const navTagStart = html.indexOf("<nav");
  if (navTagStart === -1) throw new Error("no <nav> found");
  const navHtml = extractElement(html, navTagStart);

  const footerTagStart = html.indexOf("<footer");
  if (footerTagStart === -1) throw new Error("no <footer> found");
  const footerHtml = extractElement(html, footerTagStart);

  writeFileSync(
    path.join(RAW_DIR, "00-shell.html"),
    `<!-- nav -->\n${navHtml}\n\n<!-- footer -->\n${footerHtml}\n`,
  );

  // --- 01..15: <section> elements in DOM order ---
  const sectionStarts = [];
  const sectionOpenRe = /<section\b[^>]*>/g;
  let m;
  while ((m = sectionOpenRe.exec(html))) {
    sectionStarts.push(m.index);
  }
  if (sectionStarts.length !== REGISTRY.length) {
    throw new Error(
      `expected ${REGISTRY.length} <section> elements, found ${sectionStarts.length}`,
    );
  }

  const written = [];
  REGISTRY.forEach((entry, idx) => {
    const sectionHtml = extractElement(html, sectionStarts[idx]);
    const nn = String(idx + 1).padStart(2, "0");
    const filename = `${nn}-${entry.slug}.html`;
    writeFileSync(path.join(RAW_DIR, filename), sectionHtml + "\n");
    written.push(filename);
  });

  console.log("wrote reference/style.css");
  console.log("wrote reference/props.json");
  console.log("wrote reference/dc-script.js");
  console.log("wrote reference/raw/00-shell.html");
  for (const f of written) console.log(`wrote reference/raw/${f}`);
}

main();
