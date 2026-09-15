/**
 * The pieces each detector is built out of, tested where a failure is cheap to
 * read. `tm verify` already proves the whole detector against real commits;
 * these tests pin the decisions that were argued over while writing them, so a
 * later edit cannot quietly undo one.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { sourceView, lineAt } from "../lib/source-view.mjs";
import { packageOf, bootImports, platformBoundPackages, runtimeInstallLine } from "../detectors/boot-dep-not-in-runtime-install.mjs";
import { metadataKeysWritten, readsKey } from "../detectors/owner-field-not-shown.mjs";

/* ------------------------------------------------------------- source view */

test("the view blanks comments and strings while keeping every offset", () => {
  const src = 'const a = "hello"; // import sharp from "sharp"\nconst b = 1;';
  const view = sourceView(src);
  assert.equal(view.code.length, src.length);
  assert.ok(!view.code.includes("import sharp"), "a comment must not survive as code");
  assert.ok(!view.code.includes("hello"), "a string literal must not survive as code");
  assert.ok(view.code.includes("const b = 1;"));
  assert.equal(lineAt(src, src.indexOf("const b")), 2, "line numbers must survive blanking");
});

test("a block comment holding a glob does not swallow the code after it", () => {
  const src = "/* look under packages/*/\nimport sharp from \"sharp\";\n";
  const view = sourceView(src);
  assert.ok(view.code.includes("import sharp from"), "the comment must end at its own terminator");
});

test("a template literal keeps its ${…} holes as code", () => {
  const src = "const q = `select ${table} from x`;";
  const view = sourceView(src);
  assert.ok(view.code.includes("table"), "an expression inside a hole is code");
  assert.ok(!view.code.includes("select"), "the literal chunks are not");
});

/* ------------------------------------------------------- tm-001, boot deps */

test("packageOf keeps bare packages and drops everything that is not one", () => {
  assert.equal(packageOf("sharp"), "sharp");
  assert.equal(packageOf("@medusajs/framework/utils"), "@medusajs/framework");
  assert.equal(packageOf("./helper"), null);
  assert.equal(packageOf("../workflows/tenant"), null);
  assert.equal(packageOf("node:path"), null);
  assert.equal(packageOf("path"), null, "a bare builtin is still a builtin");
  assert.equal(packageOf("@lib/profile", ["@lib/"]), null, "a configured alias is not a package");
});

test("bootImports takes module-scope imports and leaves a lazy require alone", () => {
  const src = [
    'import sharp from "sharp";',
    'import type { Config } from "typescript";',
    'import "./side-effect";',
    'export { thing } from "other-package";',
    "",
    "export default async function run() {",
    '  const { Client } = require("pg");',
    "  return new Client();",
    "}",
    "",
    'const eager = require("eager-package");',
  ].join("\n");

  const specifiers = bootImports(src).map((entry) => entry.specifier);
  assert.ok(specifiers.includes("sharp"));
  assert.ok(specifiers.includes("other-package"), "a re-export loads the module too");
  assert.ok(specifiers.includes("eager-package"), "a require at module scope is eager");
  assert.ok(!specifiers.includes("pg"), "a require inside a function body is not a boot import");
  assert.ok(!specifiers.includes("typescript"), "import type never reaches the image");
});

test("bootImports does not read a specifier out of a comment", () => {
  const src = '// import sharp from "sharp";\nimport path from "node:path";\n';
  assert.deepEqual(bootImports(src).map((e) => e.specifier), ["node:path"]);
});

test("platformBoundPackages finds the parent of per-platform optional builds", () => {
  const lock = [
    "lockfileVersion: '9.0'",
    "",
    "packages:",
    "",
    "  '@img/sharp-linux-x64@0.35.4':",
    "    resolution: {integrity: sha512-x}",
    "    cpu: [x64]",
    "    os: [linux]",
    "",
    "  sharp@0.35.4:",
    "    resolution: {integrity: sha512-y}",
    "",
    "  zod@4.2.0:",
    "    resolution: {integrity: sha512-z}",
    "",
    "snapshots:",
    "",
    "  sharp@0.35.4:",
    "    dependencies:",
    "      detect-libc: 2.1.2",
    "    optionalDependencies:",
    "      '@img/sharp-linux-x64': 0.35.4",
    "",
    "  zod@4.2.0: {}",
  ].join("\n");

  const bound = platformBoundPackages(lock);
  assert.ok(bound.has("sharp"));
  assert.ok(!bound.has("zod"));
});

test("runtimeInstallLine reads the install of the LAST stage, not the builder's", () => {
  const dockerfile = [
    "FROM node:20 AS build",
    "RUN pnpm install --frozen-lockfile",
    "FROM node:20",
    "WORKDIR /app",
    "RUN npm install --omit=dev --ignore-scripts --no-audit",
  ].join("\n");
  const line = runtimeInstallLine(dockerfile);
  assert.match(line, /^npm install --omit=dev --ignore-scripts/);
  assert.equal(runtimeInstallLine(null), null);
});

/* --------------------------------------------------- tm-002, owner's field */

test("metadataKeysWritten takes the literal's own keys and not a nested object's", () => {
  const src = [
    "update({",
    "  title: values.title,",
    "  metadata: {",
    "    image_url: values.imageUrl,",
    '    "image_alt": values.imageAlt,',
    "    nested: { inner_key: 1 },",
    "  },",
    "})",
  ].join("\n");
  const keys = [...metadataKeysWritten(src).keys()].sort();
  assert.deepEqual(keys, ["image_alt", "image_url", "nested"]);
});

test("metadataKeysWritten sees a subscript assignment", () => {
  const src = 'const metadata = { ...page.metadata };\nmetadata["promo_note"] = values.note;\n';
  assert.ok(metadataKeysWritten(src).has("promo_note"));
});

test("readsKey wants the read anchored on metadata, not on the bare name", () => {
  const writeOnly = "update({ metadata: { ...user.metadata, language: values.language } })";
  assert.equal(readsKey(writeOnly, "language"), null, "values.language is not a read of metadata.language");

  assert.ok(readsKey("const l = user.metadata?.language ?? 'ru'", "language"), "optional access is a read");
  assert.ok(readsKey('const l = category.metadata["email_locale"]', "email_locale"), "a subscript is a read");
  assert.ok(readsKey("const { alt_text } = (category.metadata ?? {})", "alt_text"), "destructuring is a read");
});

test("readsKey does not count a write as its own reader", () => {
  assert.equal(readsKey('metadata["promo_note"] = values.note', "promo_note"), null);
  assert.equal(readsKey("metadata.promo_note = values.note", "promo_note"), null);
  assert.ok(readsKey("if (metadata.promo_note === 'x') {}", "promo_note"), "a comparison is a read");
});

test("readsKey ignores a key that only appears in a doc comment", () => {
  const src = "/** metadata.image_url holds the picture. */\nexport const x = 1;\n";
  assert.equal(readsKey(src, "image_url"), null);
});
