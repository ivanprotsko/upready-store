/**
 * «никаких ссылок на ИП Черкашина и т.д. Быть не должно» (t-cherk-com-hotfix
 * batch 6, item 8, Ivan 03.10). The textual markers of a Russian sole
 * proprietor / legal entity: ИП as a standalone word (not inside another
 * word), ОГРНИП/ОГРН, and ИНН followed by digits. Kept in one file so
 * `strip-legal-entity.ts` and its test share one source of truth.
 *
 * `\b` is an ASCII notion in JavaScript regex — it never fires next to a
 * Cyrillic letter even with the `u` flag, so `\bИП\b` would match nowhere at
 * all (measured: it missed «ИП Черкашина» outright). The boundary here is
 * spelled out with `\p{L}`/`\p{N}` lookaround instead, which is what keeps
 * «типичный» (ИП buried inside a word) from matching while «ИП Черкашина»
 * does.
 *
 * NOT matched: the owner's bare surname. The stand's dry run caught it
 * matching the expert's bio page title «Черкашина Оксана» (key `about`, the
 * brand persona, not the legal entity) and blanking it (lead review,
 * 03:01). Ivan's words target «ИП Черкашина» specifically, which the ИП
 * marker alone already catches — a surname on its own is not a legal-entity
 * mention.
 */
const NOT_LETTER_OR_DIGIT = "[\\p{L}\\p{N}_]";
const wordMarker = (word: string) => `(?<!${NOT_LETTER_OR_DIGIT})${word}(?!${NOT_LETTER_OR_DIGIT})`;

export const LEGAL_ENTITY_PATTERN = new RegExp(
  `(?:${wordMarker("ИП")}|ОГРНИП|${wordMarker("ОГРН")}|ИНН\\s*\\d|индивидуальн(?:ый|ого)\\s+предпринимател[ья])`,
  "giu",
);

/** Fresh regex per call: a global regex carries `lastIndex` state between `.test()` calls otherwise. */
const matcher = () => new RegExp(LEGAL_ENTITY_PATTERN.source, LEGAL_ENTITY_PATTERN.flags);

export const matches = (text: string | null | undefined): boolean =>
  typeof text === "string" && matcher().test(text);

/** Every match with ~40 characters of context on each side, for the dry-run report. */
export const matchesWithContext = (text: string): string[] => {
  const re = matcher();
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = Math.max(0, match.index - 40);
    const end = Math.min(text.length, match.index + match[0].length + 40);
    out.push(`…${text.slice(start, end).replace(/\s+/g, " ").trim()}…`);
    if (match[0].length === 0) {
      re.lastIndex += 1;
    }
  }
  return out;
};

/** Drops every LINE that carries a mention; a line with none is kept byte-for-byte. */
export const stripLines = (text: string): { text: string; removed: number } => {
  const lines = text.split("\n");
  const kept = lines.filter((line) => !matches(line));
  return { text: kept.join("\n"), removed: lines.length - kept.length };
};

/**
 * Removes just the matched substring plus the loose punctuation it leaves
 * behind, for a short field (a page title, an attribute name) rather than a
 * body of several lines.
 */
export const stripInline = (text: string): { text: string; removed: number } => {
  const re = matcher();
  const stripped = text.replace(re, "");
  if (stripped === text) {
    return { text, removed: 0 };
  }
  const cleaned = stripped
    .replace(/\s{2,}/g, " ")
    .replace(/\s*([,;:—-])\s*(?=[,;:—-]|$)/g, "$1 ")
    .replace(/^[\s,;:—-]+|[\s,;:—-]+$/g, "")
    .trim();
  return { text: cleaned, removed: 1 };
};

/** Under this many non-whitespace characters, a page that lost its legal lines is not worth keeping published. */
export const EMPTY_PAGE_THRESHOLD = 40;

export const isEffectivelyEmpty = (text: string): boolean => text.replace(/\s+/g, "").length < EMPTY_PAGE_THRESHOLD;
