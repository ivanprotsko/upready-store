/**
 * The PUBLIC rendering of a legal page (b02-legal-and-redirects, piece 1).
 *
 * `resolveLegalPlaceholders` leaves an unfilled `{{ТОКЕН}}` on the page on
 * purpose — that was t12's "not filled" signal, and it is right for the owner,
 * who is the one who can fill it. It is wrong for the BUYER: the live shop
 * showed `{{ФИО_ИП}}`, `{{ИНН}}`, `{{ОГРНИП}}` and thirteen more to every
 * visitor of `/ru/pages/contacts` and the offer
 * (`artifacts/q03-gap-recheck/gap-recheck.md` §3, 42 + 46 occurrences).
 *
 * Ivan's rule for this task: an empty requisite is never shown as a token —
 * either a value is substituted, or the BLOCK carrying it is hidden and the
 * owner is told in the panel ("заполните реквизиты"). This module is the
 * hiding half; `GET /store/tenant/pages/:key` calls it, `GET /tenants/requisites`
 * counts what it would hide so the panel can name the pages.
 *
 * "Block" is the smallest thing the storefront's markdown
 * (`apps/storefront/src/lib/util/markdown.ts`) draws on its own line, so the
 * page loses as little as possible: one row of a table, one item of a list,
 * one paragraph or quote. A table left with nothing but its header, a list
 * left with no items, and a heading left with no section under it all go too —
 * an empty frame reads as a broken page, which is the very thing this fixes.
 */

import { resolveLegalPlaceholders, tokensInText } from "./requisites";

export type RedactionResult = {
  /** The body a visitor sees: values substituted, unfilled blocks gone. */
  body: string;
  /** How many blocks were hidden — what the panel reports to the owner. */
  hidden: number;
};

type BlockKind = "heading" | "table" | "list" | "hr" | "paragraph";

type Block = { kind: BlockKind; lines: string[] };

const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const TABLE_ROW = /^\s*\|/;
const LIST_ITEM = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/;
const TABLE_DELIMITER = /^\s*\|[\s:|-]+\|\s*$/;

const kindOf = (line: string): BlockKind => {
  if (HR.test(line)) return "hr";
  if (HEADING.test(line)) return "heading";
  if (TABLE_ROW.test(line)) return "table";
  if (LIST_ITEM.test(line)) return "list";
  return "paragraph";
};

/** Blank-line separated blocks, with a heading and a horizontal rule always alone. */
const toBlocks = (body: string): Block[] => {
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of body.split("\n")) {
    if (line.trim().length === 0) {
      current = null;
      continue;
    }

    const kind = kindOf(line);

    if (kind === "heading" || kind === "hr") {
      blocks.push({ kind, lines: [line] });
      current = null;
      continue;
    }

    // A table or a list starts a block of its own even with no blank line in
    // front of it; a plain line right after either one continues it (a
    // wrapped table cell, a list item's second line).
    if (!current || (current.kind !== kind && kind !== "paragraph")) {
      current = { kind, lines: [] };
      blocks.push(current);
    }

    current.lines.push(line);
  }

  return blocks;
};

const hasUnfilledToken = (line: string): boolean => tokensInText(line).length > 0;

/**
 * One table block minus the rows that still carry a token. The header and its
 * delimiter are kept only while at least one data row survives.
 */
const redactTable = (block: Block): { block: Block | null; hidden: number } => {
  const headerSize = block.lines.length > 1 && TABLE_DELIMITER.test(block.lines[1]) ? 2 : 0;
  const header = block.lines.slice(0, headerSize);
  const rows = block.lines.slice(headerSize);
  const kept = rows.filter((row) => !hasUnfilledToken(row));
  const hidden = rows.length - kept.length;

  // A header carrying a token takes the whole table with it and counts as one
  // hidden block; otherwise the count is the ROWS the visitor lost, and a
  // table whose every row went is dropped rather than left as a bare header.
  if (header.some(hasUnfilledToken)) {
    return { block: null, hidden: 1 };
  }

  if (kept.length === 0) {
    return { block: null, hidden };
  }

  return { block: { kind: "table", lines: [...header, ...kept] }, hidden };
};

/** One list block minus the items that still carry a token (an item is its lead line plus its continuations). */
const redactList = (block: Block): { block: Block | null; hidden: number } => {
  const items: string[][] = [];
  for (const line of block.lines) {
    if (LIST_ITEM.test(line) || items.length === 0) {
      items.push([line]);
    } else {
      items[items.length - 1].push(line);
    }
  }

  const kept = items.filter((item) => !item.some(hasUnfilledToken));
  const hidden = items.length - kept.length;

  if (kept.length === 0) {
    return { block: null, hidden };
  }

  return { block: { kind: "list", lines: kept.flat() }, hidden };
};

/** Drops a heading whose section has nothing left under it, and collapses the rules around it. */
const dropEmptySections = (blocks: Block[]): Block[] => {
  const kept: Block[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind !== "heading") {
      kept.push(block);
      continue;
    }

    let next = i + 1;
    while (next < blocks.length && blocks[next].kind === "hr") {
      next += 1;
    }

    const sectionIsEmpty = next >= blocks.length || blocks[next].kind === "heading";
    if (!sectionIsEmpty) {
      kept.push(block);
    }
  }

  return kept;
};

/** Leading, trailing and doubled horizontal rules, once the blocks around them are gone. */
const tidyRules = (blocks: Block[]): Block[] => {
  const kept: Block[] = [];

  for (const block of blocks) {
    if (block.kind !== "hr") {
      kept.push(block);
      continue;
    }
    if (kept.length === 0 || kept[kept.length - 1].kind === "hr") {
      continue;
    }
    kept.push(block);
  }

  while (kept.length && kept[kept.length - 1].kind === "hr") {
    kept.pop();
  }

  return kept;
};

/**
 * The body a visitor gets: every token with a value substituted, every block
 * still carrying an unfilled token hidden.
 *
 * A token this module does not know (`{{ЧТО_ТО_СВОЁ}}` an owner typed into her
 * own page) is not a requisite and is left exactly as written — hiding text on
 * a guess would be worse than showing what she typed.
 */
export const redactLegalPlaceholders = (
  body: string,
  values: Record<string, string | null | undefined>,
): RedactionResult => {
  const filled = resolveLegalPlaceholders(body, values);

  if (tokensInText(filled).length === 0) {
    return { body: filled, hidden: 0 };
  }

  let hidden = 0;
  const kept: Block[] = [];

  for (const block of toBlocks(filled)) {
    if (!block.lines.some(hasUnfilledToken)) {
      kept.push(block);
      continue;
    }

    if (block.kind === "table") {
      const result = redactTable(block);
      hidden += result.hidden;
      if (result.block) kept.push(result.block);
      continue;
    }

    if (block.kind === "list") {
      const result = redactList(block);
      hidden += result.hidden;
      if (result.block) kept.push(result.block);
      continue;
    }

    // A heading or a paragraph goes whole: there is no smaller unit of it the
    // storefront draws separately.
    hidden += 1;
  }

  const body_ = tidyRules(dropEmptySections(kept))
    .map((block) => block.lines.join("\n"))
    .join("\n\n");

  return { body: body_.trim(), hidden };
};

/**
 * The same rule for a ONE-LINE field — a page title, an SEO title, a meta
 * description (b09 resolves placeholders in all three; b02 decides what an
 * unfilled one does there).
 *
 * There is no block to hide in a line, and hiding the line would leave a page
 * with no title at all, so the token is dropped from it and the seam is tidied:
 * doubled spaces collapse, and a separator left dangling at either end
 * (« — », «,», «:», «|») goes with it. «Оферта {{ФИО_ИП}}» reads «Оферта», not
 * «Оферта {{ФИО_ИП}}» and not "".
 */
export const redactLegalInline = (
  text: string,
  values: Record<string, string | null | undefined>,
): string => {
  const filled = resolveLegalPlaceholders(text, values);

  if (tokensInText(filled).length === 0) {
    return filled;
  }

  return filled
    .replace(/`?\{\{[^}]+\}\}`?/g, (match) => (tokensInText(match).length ? "" : match))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s\-–—,;:|]+/, "")
    .replace(/[\s\-–—,;:|]+$/, "")
    .trim();
};
