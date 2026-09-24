/**
 * `node --test scripts/media/` — the variant cutter's contract: which widths it
 * plans, that `--dry-run` writes nothing, that an unknown flag is an error.
 * Runs on a 1200×600 picture drawn by sharp in a temp directory, never on a
 * real cover.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseArgs, planVariants, qualityFor, run } from "./make-image-variants.mjs";

const SCRIPT = fileURLToPath(new URL("./make-image-variants.mjs", import.meta.url));

describe("planVariants", () => {
  it("skips every width wider than the source and keeps the ratio", () => {
    const { variants, skipped } = planVariants({ sourceWidth: 1200, sourceHeight: 600, name: "c" });
    assert.deepEqual(
      variants.map((v) => [v.file, v.width, v.height]),
      [
        ["c-480.webp", 480, 240],
        ["c-768.webp", 768, 384],
        ["c-1080.webp", 1080, 540],
      ],
    );
    assert.deepEqual(skipped, [1440, 1920]);
  });

  it("writes one file per width and format", () => {
    const { variants } = planVariants({
      sourceWidth: 2000,
      sourceHeight: 1000,
      widths: [768, 480, 480],
      formats: ["webp", "avif"],
      name: "x",
    });
    assert.deepEqual(
      variants.map((v) => v.file),
      ["x-480.webp", "x-480.avif", "x-768.webp", "x-768.avif"],
    );
  });

  it("tunes the quality per width", () => {
    assert.equal(qualityFor(480), 82);
    assert.equal(qualityFor(768), 82);
    assert.equal(qualityFor(1080), 78);
    assert.equal(qualityFor(1920), 78);
    assert.ok(qualityFor(480, "avif") < qualityFor(480, "webp"));
  });
});

describe("parseArgs", () => {
  it("rejects an unknown flag", () => {
    assert.throws(() => parseArgs(["a.png", "out", "--bogus"]), /unknown flag: --bogus/);
  });
  it("rejects an unknown format and a bad width", () => {
    assert.throws(() => parseArgs(["a.png", "out", "--formats", "gif"]), /unknown format/);
    assert.throws(() => parseArgs(["a.png", "out", "--widths", "480,abc"]), /positive integers/);
  });
  it("needs exactly a source and an output directory", () => {
    assert.throws(() => parseArgs(["a.png"]), /usage/);
  });
});

describe("the CLI", () => {
  let dir;
  let source;

  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "variants-"));
    source = path.join(dir, "cover.png");
    const { default: sharp } = await import("sharp");
    await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#7a9a6b" } })
      .png()
      .toFile(source);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("exits non-zero on an unknown flag", () => {
    const result = spawnSync(process.execPath, [SCRIPT, source, path.join(dir, "out"), "--nope"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown flag: --nope/);
  });

  it("--dry-run prints the plan and writes nothing", async () => {
    const out = path.join(dir, "dry");
    const lines = [];
    const { written } = await run([source, out, "--dry-run"], (line) => lines.push(line));
    assert.equal(written.length, 0);
    assert.equal(existsSync(out), false);
    assert.ok(lines.some((line) => line.includes("would write") && line.includes("cover-1080.webp")));
    assert.ok(lines.some((line) => line === "skip 1920: wider than the source"));
  });

  it("writes the variants and their manifest", async () => {
    const out = path.join(dir, "real");
    const { written } = await run([source, out, "--name", "hero"], () => {});
    assert.deepEqual(readdirSync(out).sort(), [
      "hero-1080.webp",
      "hero-480.webp",
      "hero-768.webp",
      "hero.variants.json",
    ]);
    const manifest = JSON.parse(readFileSync(path.join(out, "hero.variants.json"), "utf8"));
    assert.equal(manifest.width, 1200);
    assert.deepEqual(
      manifest.variants.map((v) => v.width),
      written.map((v) => v.width),
    );
    assert.ok(manifest.variants.every((v) => v.bytes > 0));
  });
});
