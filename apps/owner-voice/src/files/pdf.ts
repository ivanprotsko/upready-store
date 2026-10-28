/**
 * The text of a PDF, in plain JS: no native build and no package, only
 * `node:zlib` for the compressed streams.
 *
 * It reads what a price list, an invoice or a supplier letter needs: the
 * objects (also inside object streams), each page's content streams, the
 * text operators (Tj, TJ, ', ") with line breaks from the positioning ones,
 * and the fonts' ToUnicode maps, so Cyrillic from Word or LibreOffice comes
 * out as Cyrillic. Without a map a string is read as Latin-1.
 *
 * A page that draws only pictures has no text layer: that is a scan, and the
 * result says so instead of pretending the file is empty. An encrypted PDF is
 * named as such; it is not decrypted.
 */
import { inflateSync, unzipSync } from "node:zlib";

export interface PdfText {
  pages: number;
  text: string;
  /** No text layer at all, only pictures: a scan. */
  scan: boolean;
  encrypted: boolean;
}

type Ref = { ref: number };

interface PdfObject {
  dict: string;
  stream: Uint8Array | null;
}

const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("latin1");

/** The streams of a file, inflated where they are Flate; other filters (images) stay as they are. */
function decode(dict: string, raw: Uint8Array): Uint8Array {
  if (!/\/FlateDecode|\/Fl\b/.test(dict)) return raw;
  try {
    return new Uint8Array(inflateSync(raw));
  } catch {
    try {
      return new Uint8Array(unzipSync(raw, { finishFlush: 2 }));
    } catch {
      return new Uint8Array();
    }
  }
}

/** Every `n g obj … endobj` of the file, by number; a later definition wins, as an update would. */
function readObjects(bytes: Uint8Array): Map<number, PdfObject> {
  const text = latin1(bytes);
  const objects = new Map<number, PdfObject>();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("endobj", start);
    if (end < 0) break;
    const body = text.slice(start, end);
    const at = body.search(/\bstream\r?\n/);
    if (at < 0) {
      objects.set(Number(m[1]), { dict: body.trim(), stream: null });
    } else {
      const dict = body.slice(0, at);
      const dataStart = start + at + body.slice(at).match(/^stream\r?\n/)![0].length;
      const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      let dataEnd = length ? dataStart + Number(length[1]) : text.lastIndexOf("endstream", end);
      if (dataEnd > end || dataEnd < dataStart) dataEnd = text.lastIndexOf("endstream", end);
      objects.set(Number(m[1]), { dict: dict.trim(), stream: decode(dict, bytes.subarray(dataStart, dataEnd)) });
    }
    re.lastIndex = end;
  }
  // Object streams hold the dictionaries of most files written since PDF 1.5.
  for (const obj of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(obj.dict) || !obj.stream) continue;
    const n = Number(/\/N\s+(\d+)/.exec(obj.dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(obj.dict)?.[1] ?? 0);
    const data = latin1(obj.stream);
    const header = data.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i += 1) {
      const num = header[i * 2]!;
      const off = first + header[i * 2 + 1]!;
      const next = i + 1 < n ? first + header[(i + 1) * 2 + 1]! : data.length;
      if (!objects.has(num)) objects.set(num, { dict: data.slice(off, next).trim(), stream: null });
    }
  }
  return objects;
}

const refOf = (value: string | undefined): Ref | null => {
  const m = value ? /^(\d+)\s+\d+\s+R/.exec(value.trim()) : null;
  return m ? { ref: Number(m[1]) } : null;
};

/** The value after `/Key` in a dictionary: a reference, a `<< … >>`, an `[ … ]` or one token. */
function entry(dict: string, key: string): string | undefined {
  const at = new RegExp(`/${key}(?![A-Za-z0-9])\\s*`).exec(dict);
  if (!at) return undefined;
  const rest = dict.slice(at.index + at[0].length);
  const ref = /^\d+\s+\d+\s+R/.exec(rest);
  if (ref) return ref[0];
  const open: [string, string] | null = rest.startsWith("<<") ? ["<<", ">>"] : rest.startsWith("[") ? ["[", "]"] : null;
  if (!open) return /^[^\s/<>[\]()]+|^\/[^\s/<>[\]()]+/.exec(rest)?.[0];
  let depth = 0;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest.startsWith(open[0], i)) {
      depth += 1;
      i += open[0].length - 1;
    } else if (rest.startsWith(open[1], i)) {
      depth -= 1;
      i += open[1].length - 1;
      if (depth === 0) return rest.slice(0, i + 1);
    }
  }
  return rest;
}

// ---- fonts: a ToUnicode CMap as code → text

interface CMap {
  bytes: number;
  map: Map<number, string>;
}

const hexText = (hex: string): string => {
  const units: number[] = [];
  for (let i = 0; i + 4 <= hex.length; i += 4) units.push(parseInt(hex.slice(i, i + 4), 16));
  if (hex.length % 4 === 2) units.push(parseInt(hex.slice(-2), 16));
  return String.fromCharCode(...units);
};

function parseCMap(text: string): CMap {
  const map = new Map<number, string>();
  let bytes = 0;
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text);
  if (space) bytes = space[1]!.length / 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      bytes ||= m[1]!.length / 2;
      map.set(parseInt(m[1]!, 16), hexText(m[2]!));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      bytes ||= m[1]!.length / 2;
      const lo = parseInt(m[1]!, 16);
      const hi = parseInt(m[2]!, 16);
      if (hi - lo > 0xffff) continue;
      if (m[3]!.startsWith("[")) {
        const list = [...m[3]!.matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => hexText(x[1]!));
        list.forEach((t, i) => map.set(lo + i, t));
      } else {
        const base = m[3]!.slice(1, -1);
        const start = parseInt(base.slice(-4) || "0", 16);
        const prefix = hexText(base.slice(0, -4));
        for (let c = lo; c <= hi; c += 1) map.set(c, prefix + String.fromCharCode(start + (c - lo)));
      }
    }
  }
  return { bytes: bytes || 1, map };
}

// ---- content streams

/** The strings of a literal `( … )` with its escapes, from `i` just after the `(`. */
function literal(src: string, i: number): [string, number] {
  let out = "";
  let depth = 1;
  for (; i < src.length; i += 1) {
    const c = src[i]!;
    if (c === "\\") {
      const n = src[i + 1]!;
      const esc: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      if (n in esc) {
        out += esc[n];
        i += 1;
      } else if (/[0-7]/.test(n)) {
        const oct = /^[0-7]{1,3}/.exec(src.slice(i + 1))![0];
        out += String.fromCharCode(parseInt(oct, 8));
        i += oct.length;
      } else if (n === "\r" || n === "\n") {
        i += n === "\r" && src[i + 2] === "\n" ? 2 : 1;
      }
    } else if (c === "(") {
      depth += 1;
      out += c;
    } else if (c === ")") {
      depth -= 1;
      if (depth === 0) return [out, i + 1];
      out += c;
    } else out += c;
  }
  return [out, i];
}

type Token = { kind: "str"; value: string } | { kind: "num"; value: number } | { kind: "name"; value: string } | { kind: "op"; value: string } | { kind: "arr"; value: Token[] };

function tokenize(src: string): Token[] {
  const stack: Token[][] = [[]];
  const push = (t: Token) => stack.at(-1)!.push(t);
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) i += 1;
    else if (c === "%") i = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i);
    else if (c === "(") {
      const [value, next] = literal(src, i + 1);
      push({ kind: "str", value });
      i = next;
    } else if (c === "<" && src[i + 1] !== "<") {
      const end = src.indexOf(">", i);
      const hex = src.slice(i + 1, end < 0 ? src.length : end).replace(/\s/g, "");
      const padded = hex.length % 2 ? `${hex}0` : hex;
      push({ kind: "str", value: Buffer.from(padded, "hex").toString("latin1") });
      i = end < 0 ? src.length : end + 1;
    } else if (c === "[") {
      stack.push([]);
      i += 1;
    } else if (c === "]") {
      const arr = stack.length > 1 ? stack.pop()! : [];
      push({ kind: "arr", value: arr });
      i += 1;
    } else if (c === "/") {
      const m = /^\/[^\s/<>[\]()%{}]*/.exec(src.slice(i))![0];
      push({ kind: "name", value: m.slice(1) });
      i += m.length;
    } else if (/[-+.\d]/.test(c)) {
      const m = /^[-+]?(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (m) {
        push({ kind: "num", value: Number(m[0]) });
        i += m[0].length;
      } else i += 1;
    } else if (src.startsWith("<<", i) || src.startsWith(">>", i)) i += 2;
    else if (src.startsWith("BI", i) && /\s/.test(src[i + 2] ?? " ")) {
      // An inline image: skip its data up to EI.
      const end = src.indexOf("EI", i + 2);
      i = end < 0 ? src.length : end + 2;
    } else {
      const m = /^[A-Za-z'"*]+[0-9]?/.exec(src.slice(i));
      if (m) {
        push({ kind: "op", value: m[0] });
        i += m[0].length;
      } else i += 1;
    }
  }
  return stack[0]!;
}

function show(raw: string, cmap: CMap | undefined): string {
  if (!cmap) return raw;
  let out = "";
  for (let i = 0; i + cmap.bytes <= raw.length; i += cmap.bytes) {
    let code = 0;
    for (let b = 0; b < cmap.bytes; b += 1) code = code * 256 + raw.charCodeAt(i + b);
    out += cmap.map.get(code) ?? "";
  }
  return out;
}

function pageText(content: string, fonts: Map<string, CMap | undefined>): string {
  let out = "";
  let font: CMap | undefined;
  let args: Token[] = [];
  const newline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  for (const t of tokenize(content)) {
    if (t.kind !== "op") {
      args.push(t);
      continue;
    }
    switch (t.value) {
      case "Tf": {
        const name = args.find((a) => a.kind === "name");
        font = name ? fonts.get(name.value as string) : undefined;
        break;
      }
      case "Tj":
      case "'":
      case '"': {
        if (t.value !== "Tj") newline();
        const s = args.filter((a) => a.kind === "str").at(-1);
        if (s) out += show(s.value as string, font);
        break;
      }
      case "TJ": {
        const arr = args.find((a) => a.kind === "arr");
        for (const part of (arr?.value as Token[] | undefined) ?? []) {
          if (part.kind === "str") out += show(part.value, font);
          // A wide negative kern is a space between words.
          else if (part.kind === "num" && part.value < -200 && !out.endsWith(" ")) out += " ";
        }
        break;
      }
      case "T*":
        newline();
        break;
      case "Td":
      case "TD": {
        const y = args.filter((a) => a.kind === "num").at(-1);
        if (y && y.value !== 0) newline();
        else if (out && !/\s$/.test(out)) out += " ";
        break;
      }
      case "Tm":
        newline();
        break;
      case "ET":
        newline();
        break;
    }
    args = [];
  }
  return out;
}

export function extractPdfText(bytes: Uint8Array): PdfText {
  const head = latin1(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) throw new Error("not a PDF");
  const objects = readObjects(bytes);
  const tail = latin1(bytes.subarray(Math.max(0, bytes.length - 4096)));
  const encrypted = /\/Encrypt\s+\d+\s+\d+\s+R/.test(tail) || [...objects.values()].some((o) => /\/Type\s*\/XRef/.test(o.dict) && /\/Encrypt/.test(o.dict));
  const resolve = (value: string | undefined): string | undefined => {
    const ref = refOf(value);
    return ref ? objects.get(ref.ref)?.dict : value;
  };

  const pages = [...objects.entries()].filter(([, o]) => /\/Type\s*\/Page(?![s\w])/.test(o.dict)).sort(([a], [b]) => a - b);
  if (encrypted) return { pages: pages.length, text: "", scan: false, encrypted: true };

  const cmaps = new Map<number, CMap>();
  const cmapOf = (fontDict: string | undefined): CMap | undefined => {
    const ref = refOf(entry(fontDict ?? "", "ToUnicode"));
    if (!ref) return undefined;
    if (!cmaps.has(ref.ref)) {
      const stream = objects.get(ref.ref)?.stream;
      if (!stream) return undefined;
      cmaps.set(ref.ref, parseCMap(latin1(stream)));
    }
    return cmaps.get(ref.ref);
  };

  /** Resources inherit from the page tree: walk up `/Parent` until one has them. */
  const resourcesOf = (dict: string): string => {
    let at: string | undefined = dict;
    for (let depth = 0; at && depth < 20; depth += 1) {
      const res = resolve(entry(at, "Resources"));
      if (res) return res;
      at = resolve(entry(at, "Parent"));
    }
    return "";
  };

  const texts: string[] = [];
  for (const [, page] of pages) {
    const resources = resourcesOf(page.dict);
    const fontDict = resolve(entry(resources, "Font")) ?? "";
    const fonts = new Map<string, CMap | undefined>();
    for (const m of fontDict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+\s+\d+\s+R)/g)) fonts.set(m[1]!, cmapOf(resolve(m[2])));
    const contents = entry(page.dict, "Contents") ?? "";
    const refs = [...contents.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
    const content = refs.map((r) => (objects.get(r)?.stream ? latin1(objects.get(r)!.stream!) : "")).join("\n");
    texts.push(pageText(content, fonts));
  }
  const text = texts
    .join("\n\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const letters = text.replace(/[^\p{L}\p{N}]/gu, "").length;
  return { pages: pages.length, text, scan: pages.length > 0 && letters < 3, encrypted: false };
}
