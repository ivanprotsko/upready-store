/**
 * tm-002 — the shop owner fills a field in the panel and the storefront never
 * puts it on a page.
 *
 * The bug this method was extracted from (f16-category-image-not-shown,
 * PR #54, 2026-09-15): the panel's category form uploaded a picture, wrote it
 * to `metadata.image_url`, and told the owner it "shows as a tile everywhere
 * the storefront draws this category". The storefront drew it nowhere. Live
 * measurement on the owner's own shop: 0 images on `/ru`, `/ru/store` and
 * `/ru/categories/asd-cherkashino`, 0 of 12 category links carrying an `<img>`.
 * Nothing failed anywhere: the write succeeded, the API returned the field, the
 * page rendered 200.
 *
 * The class has two faces, and this detector carries a check for each because
 * f16 was the second one and the first is its obvious sibling.
 *
 *  A. `written-never-read` — a `metadata.*` key the panel writes that nothing
 *     reads back: not the storefront, not the backend, not the panel itself.
 *     The owner edits a field whose value has no consumer anywhere. The reader
 *     search covers all three apps on purpose, because a metadata key is a
 *     legitimate contract between the panel and the backend as often as
 *     between the panel and a page (`metadata.locale` on a password-reset
 *     request picks the language of the e-mail, and is read by
 *     apps/backend/src/emails/i18n/locale.ts). Narrowing the search to the
 *     storefront turns every such contract into a finding.
 *
 *  B. `owner-data-loses-to-build-defaults` — the storefront does read the
 *     field, and then throws the reading away when it is not plentiful enough,
 *     falling back to data baked in at build time. This is f16 exactly:
 *
 *         if (own.length >= 3) return own
 *         ...
 *         return profileCategoryTiles.filter(...)
 *
 *     An owner with one picture got the build profile's list, which belongs to
 *     another shop, and no explanation on any screen. A threshold on the
 *     owner's own data is a silent discard, so the check fires on a `.length`
 *     comparison against a literal of 2 or more whose branch hands back a
 *     build-time source.
 *
 * Face A alone does NOT catch f16 (measured: at c60638b both `image_url` and
 * `image_alt` had storefront readers), which is the whole reason face B is
 * here. A method is proven on the bug it came from, not on the bug it is
 * comfortable with.
 */
import path from "node:path";
import { sourceView, lineAt, lineTextAt } from "../lib/source-view.mjs";
import { walkFiles, readIfPresent } from "../lib/walk.mjs";

/** True when `offset` in the original source is real code rather than a blanked span. */
function isCode(view, offset) {
  return view.code[offset] === view.source[offset];
}

/** The span of a balanced `{...}` whose opening brace sits at `open`. */
function balanced(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const KEY_LINE = /(^|[\n,{])\s*(?:"([A-Za-z_][\w]*)"|'([A-Za-z_][\w]*)'|([A-Za-z_][\w]*))\s*:/g;

/**
 * The `metadata.*` keys a panel source writes: the properties of every
 * `metadata: { ... }` literal, plus `metadata.key =` and `metadata["key"] =`
 * assignments. Only top-level properties of the literal count, so a nested
 * object's own keys are not mistaken for metadata keys.
 */
export function metadataKeysWritten(src) {
  const view = sourceView(src);
  // Keys are read off a comment-free view that still holds the string
  // literals, because `"image_alt": value` is a quoted key and a string at the
  // same time. Braces and depth are taken from the fully blanked view, where a
  // brace inside a string cannot lie about the shape of the object.
  const text = sourceView(src, { keepStrings: true }).code;
  const keys = new Map();

  const literal = /\bmetadata\s*:\s*\{/g;
  let m;
  while ((m = literal.exec(view.code))) {
    const open = view.code.indexOf("{", m.index);
    const close = balanced(view.code, open);
    if (close === -1) continue;
    const body = text.slice(open, close + 1);
    const shape = view.code.slice(open, close + 1);
    KEY_LINE.lastIndex = 0;
    let k;
    while ((k = KEY_LINE.exec(body))) {
      const before = shape.slice(0, k.index + k[0].length);
      let depth = 0;
      for (const ch of before) {
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
      }
      if (depth !== 1) continue;
      const name = k[2] ?? k[3] ?? k[4];
      const offset = open + k.index;
      if (name && !keys.has(name)) keys.set(name, { line: lineAt(src, offset), text: lineTextAt(src, offset) });
    }
  }

  // `metadata["key"] = value` keeps the key inside a string literal, which the
  // blanked view has emptied, so this one runs on the original source and asks
  // the view whether the match is real code rather than a comment.
  const assign = /\bmetadata(?:\.([A-Za-z_]\w*)|\[\s*['"]([A-Za-z_]\w*)['"]\s*\])\s*=[^=]/g;
  while ((m = assign.exec(src))) {
    if (view.code[m.index] !== src[m.index]) continue;
    const name = m[1] ?? m[2];
    if (name && !keys.has(name)) keys.set(name, { line: lineAt(src, m.index), text: lineTextAt(src, m.index) });
  }

  return keys;
}

/**
 * Whether a source reads `key` OFF METADATA. The reader has to be anchored on
 * the metadata object itself, never on the bare property name: a form that
 * writes `metadata: { language: values.language }` also holds `values.language`
 * four lines up, and counting that as a reader makes the write vouch for
 * itself. Three shapes count, and nothing else does:
 *
 *   metadata.key / metadata?.key / meta.key      property access
 *   metadata["key"] / meta?.['key']              string subscript
 *   const { key, ... } = ...metadata             destructuring
 *
 * The scan runs on the blanked view, so a key named only in a doc comment is
 * not a reader either.
 */
function isAssignmentTarget(code, end) {
  let i = end;
  while (i < code.length && /\s/.test(code[i])) i += 1;
  return code[i] === "=" && code[i + 1] !== "=";
}

export function readsKey(src, key) {
  const view = sourceView(src);
  if (!/\bmetadata\b/.test(view.code)) return null;

  // A write is not a read. `metadata.key = value` and `metadata["key"] = value`
  // are the very sites this detector is looking for, and counting them as
  // consumers lets the write vouch for itself — which is exactly what happened
  // to the subscript variant before this guard existed.
  const access = new RegExp(`\\b(?:metadata|meta)\\s*(?:\\?\\.|\\.)\\s*${key}\\b`, "g");
  let hit;
  while ((hit = access.exec(view.code))) {
    if (isAssignmentTarget(view.code, hit.index + hit[0].length)) continue;
    return { line: lineAt(src, hit.index), text: lineTextAt(src, hit.index) };
  }

  // A subscript keeps the key inside a string literal, which the blanked view
  // has emptied, so it is matched on the original source and then confirmed to
  // be real code by the view.
  const subscript = new RegExp(`\\b(?:metadata|meta)\\s*(?:\\?\\.)?\\[\\s*['"]${key}['"]\\s*\\]`, "g");
  let m;
  while ((m = subscript.exec(src))) {
    if (view.code[m.index] !== src[m.index]) continue;
    if (isAssignmentTarget(view.code, m.index + m[0].length)) continue;
    return { line: lineAt(src, m.index), text: lineTextAt(src, m.index) };
  }

  const destructure = new RegExp(
    `\\{[^}]*\\b${key}\\b[^}]*\\}\\s*=\\s*[^;\\n]*\\bmetadata\\b`
  );
  const d = destructure.exec(view.code);
  if (d) return { line: lineAt(src, d.index), text: lineTextAt(src, d.index) };

  return null;
}

export const id = "tm-002";

export function run(root, config) {
  const findings = [];
  const panelFiles = walkFiles(root, path.join(config.panel, "src"), { skip: ["__tests__"] }).filter(
    (file) => !/\.test\.tsx?$/.test(file)
  );
  const frontFiles = walkFiles(root, path.join(config.storefront, "src"), { skip: ["__tests__"] }).filter(
    (file) => !/\.test\.tsx?$/.test(file)
  );

  if (!panelFiles.length || !frontFiles.length) {
    return {
      status: "skipped",
      reason: "the panel or the storefront is absent in this tree",
      findings,
      checked: { panelFiles: panelFiles.length, storefrontFiles: frontFiles.length },
    };
  }

  const ignored = new Set(config.ignoreKeys ?? []);

  /** key -> first panel write site */
  const written = new Map();
  for (const file of panelFiles) {
    const src = readIfPresent(root, file);
    if (src === null) continue;
    for (const [key, site] of metadataKeysWritten(src)) {
      if (ignored.has(key)) continue;
      if (!written.has(key)) written.set(key, { ...site, file });
    }
  }

  const frontSources = frontFiles
    .map((file) => ({ file, src: readIfPresent(root, file) }))
    .filter((entry) => entry.src !== null);

  // Everything that may legitimately consume a key the panel writes. The write
  // sites themselves are excluded below, so a form that only writes a key does
  // not vouch for it.
  const readerDirs = config.readerDirs ?? [
    path.join(config.storefront, "src"),
    path.join(config.panel, "src"),
  ];
  const readerSources = [
    ...new Set(readerDirs.flatMap((dir) => walkFiles(root, dir, { skip: ["__tests__"] }))),
  ]
    .map((file) => ({ file, src: readIfPresent(root, file) }))
    .filter((entry) => entry.src !== null);

  for (const [key, site] of written) {
    let reader = null;
    for (const entry of readerSources) {
      // The write site stays in the search: `readsKey` looks for a property
      // access and the write is an object literal, so a form that reads its own
      // key back to prefill the field is correctly counted as a consumer.
      const hit = readsKey(entry.src, key);
      if (hit) {
        reader = { ...hit, file: entry.file };
        break;
      }
    }
    if (!reader) {
      findings.push({
        check: "written-never-read",
        severity: "red",
        key,
        file: site.file,
        line: site.line,
        evidence: site.text,
        message: `the panel writes metadata.${key} and nothing under ${readerDirs.join(", ")} reads it back: the owner edits a field with no consumer.`,
      });
    }
  }

  // Face B: the storefront reads the owner's data and then discards it.
  const buildTime = config.buildTimeModules ?? [];
  const ownerMarkers = config.ownerDataMarkers ?? ["metadata"];
  const window = config.fallbackWindow ?? 400;

  for (const entry of frontSources) {
    const view = sourceView(entry.src);
    if (!ownerMarkers.some((marker) => new RegExp(`\\b${marker}\\b`).test(view.code))) continue;

    const imported = [];
    const importRe = /\bimport\s+([^;'"`]*?)\bfrom\s*(['"])([^'"]+)\2/g;
    let im;
    while ((im = importRe.exec(entry.src))) {
      if (!isCode(view, im.index)) continue;
      if (!buildTime.some((mod) => im[3] === mod || im[3].startsWith(`${mod}/`))) continue;
      const clause = im[1];
      for (const name of clause.matchAll(/([A-Za-z_]\w*)\s*(?:,|\}|$)/g)) imported.push(name[1]);
    }
    if (!imported.length) continue;

    const threshold = /(\w+)\.length\s*(>=|>)\s*(\d+)/g;
    let th;
    while ((th = threshold.exec(view.code))) {
      const min = th[2] === ">=" ? Number(th[3]) : Number(th[3]) + 1;
      if (min < 2) continue;
      const after = view.code.slice(th.index, th.index + window);
      const fallback = imported.find((name) => new RegExp(`\\b${name}\\b`).test(after));
      if (!fallback) continue;
      findings.push({
        check: "owner-data-loses-to-build-defaults",
        severity: "red",
        key: th[1],
        file: entry.file,
        line: lineAt(entry.src, th.index),
        evidence: lineTextAt(entry.src, th.index),
        message: `\`${th[1]}\` is built from the owner's own data and kept only when it holds ${min} items or more; below that the page falls back to \`${fallback}\`, which is baked in at build time. The owner's single entry disappears with no message anywhere.`,
      });
    }
  }

  return {
    status: findings.length ? "red" : "green",
    findings,
    checked: {
      panelFiles: panelFiles.length,
      storefrontFiles: frontSources.length,
      readerFiles: readerSources.length,
      metadataKeys: [...written.keys()].sort(),
    },
  };
}
