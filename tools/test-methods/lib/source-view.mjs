/**
 * A lexer view of a JavaScript/TypeScript source file.
 *
 * Every detector in this directory reads code somebody else wrote, and a regex
 * that treats comments and string literals as code is the cheapest way to
 * invent a finding. `packages/*` inside a prompt string opens a block comment
 * that runs to the next `*\/` forty lines down and deletes the code between;
 * a `metadata.image_url` mentioned in a doc comment reads as a live reader of
 * that field. So the scanning helpers here work on a BLANKED view: comments,
 * string literals, template literals and regex literals are replaced by spaces
 * of the same length, which keeps every offset and every line number equal to
 * the original file.
 *
 * `code` is that view. `strings` is the list of string literal contents with
 * their offsets, because a key written as `metadata["image_url"]` lives inside
 * a string and a detector has to be able to ask for those deliberately rather
 * than by accident.
 *
 * `sourceView(src, { keepStrings: true })` blanks comments ONLY. A key spelled
 * `"image_alt": value` inside an object literal is a real key and a real
 * string at once, so a detector that reads keys needs the comments gone and
 * the literals intact. Offsets stay equal to the original file in both modes,
 * which is what lets one call decide the braces and the other read the names.
 */

const WS = " ";

function blank(out, from, to) {
  for (let i = from; i < to; i += 1) {
    out[i] = out[i] === "\n" ? "\n" : WS;
  }
}

/**
 * Decide whether a `/` at `i` starts a regex literal rather than a division.
 * The usual heuristic: look back at the last significant character. After a
 * value (identifier, `)`, `]`, number) a slash divides; after an operator, a
 * keyword or the start of the file it opens a pattern.
 */
function regexAllowedBefore(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return true;
  const ch = src[j];
  if (/[)\]}]/.test(ch)) return false;
  if (/[A-Za-z0-9_$]/.test(ch)) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k -= 1;
    const word = src.slice(k + 1, j + 1);
    return ["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await"].includes(
      word
    );
  }
  return true;
}

export function sourceView(src, { keepStrings = false } = {}) {
  const out = src.split("");
  const strings = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];

    if (ch === "/" && src[i + 1] === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j += 1;
      blank(out, i, j);
      i = j;
      continue;
    }

    if (ch === "/" && src[i + 1] === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      blank(out, i, j);
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === ch || src[j] === "\n") break;
        j += 1;
      }
      const end = Math.min(j + 1, n);
      strings.push({ start: i + 1, end: j, value: src.slice(i + 1, j) });
      if (!keepStrings) blank(out, i, end);
      i = end;
      continue;
    }

    if (ch === "`") {
      // A template literal can hold `${ ... }` holes carrying real code. Blank
      // the literal chunks and leave the holes alone, so a detector still sees
      // the expressions inside them.
      let j = i + 1;
      let chunkStart = j;
      let depth = 0;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (depth === 0 && src[j] === "`") break;
        if (depth === 0 && src[j] === "$" && src[j + 1] === "{") {
          strings.push({ start: chunkStart, end: j, value: src.slice(chunkStart, j) });
          if (!keepStrings) blank(out, chunkStart, j);
          depth = 1;
          j += 2;
          let braces = 1;
          while (j < n && braces > 0) {
            if (src[j] === "{") braces += 1;
            else if (src[j] === "}") braces -= 1;
            j += 1;
          }
          depth = 0;
          chunkStart = j;
          continue;
        }
        j += 1;
      }
      strings.push({ start: chunkStart, end: j, value: src.slice(chunkStart, j) });
      if (!keepStrings) {
        blank(out, chunkStart, Math.min(j, n));
        out[i] = WS;
        if (j < n) out[j] = WS;
      }
      i = j + 1;
      continue;
    }

    if (ch === "/" && regexAllowedBefore(src, i)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        const c = src[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === "\n") break;
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          closed = true;
          j += 1;
          break;
        }
        j += 1;
      }
      if (closed) {
        while (j < n && /[a-z]/.test(src[j])) j += 1;
        if (!keepStrings) blank(out, i, j);
        i = j;
        continue;
      }
    }

    i += 1;
  }

  return { code: out.join(""), strings, source: src };
}

/** 1-based line number of a character offset. */
export function lineAt(src, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i += 1) {
    if (src[i] === "\n") line += 1;
  }
  return line;
}

/** The whole line an offset falls on, trimmed. */
export function lineTextAt(src, offset) {
  const start = src.lastIndexOf("\n", offset) + 1;
  let end = src.indexOf("\n", offset);
  if (end === -1) end = src.length;
  return src.slice(start, end).trim();
}
