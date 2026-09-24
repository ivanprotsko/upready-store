#!/usr/bin/env node
/**
 * Cuts one source picture into the responsive variants a storefront `srcset`
 * picks from (t-2026-09-24-n23, the cover of «Очищение печени»).
 *
 *   node scripts/media/make-image-variants.mjs <source> <out-dir> [options]
 *
 *   --name <base>        file stem of the variants (default: the source's own)
 *   --widths <list>      comma-separated widths (default: 480,768,1080,1440,1920)
 *   --formats <list>     webp, avif or both (default: webp)
 *   --dry-run            print the plan, write nothing
 *
 * Every width wider than the source is skipped (an upscale only adds bytes).
 * The quality drops a little as the width grows: a big picture is viewed on a
 * big screen, where the finer steps of compression are not visible, and a
 * phone gets the extra quality where every pixel counts. Beside the files it
 * writes `<name>.variants.json` (source size and every variant's width, height,
 * bytes), which is what the course fixture's data file is filled from.
 *
 * The source is read by `sharp` only; it is never loaded into anything else.
 * A 10 MB PNG becomes about a megabyte of WebP for all five widths together.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_WIDTHS = [480, 768, 1080, 1440, 1920];
export const FORMATS = ["webp", "avif"];

/** WebP quality per width: 82 up to a tablet, 78 above it. AVIF needs less for the same look. */
export function qualityFor(width, format = "webp") {
  const webp = width <= 768 ? 82 : 78;
  return format === "avif" ? webp - 22 : webp;
}

/**
 * Which files to write for a source of `sourceWidth` × `sourceHeight`.
 * Widths wider than the source are dropped (reported as `skipped`), the rest
 * keep the source's ratio, rounded to whole pixels.
 */
export function planVariants({
  sourceWidth,
  sourceHeight,
  widths = DEFAULT_WIDTHS,
  formats = ["webp"],
  name,
}) {
  const unique = [...new Set(widths)].sort((a, b) => a - b);
  const variants = [];
  const skipped = [];

  for (const width of unique) {
    if (width > sourceWidth) {
      skipped.push(width);
      continue;
    }
    const height = Math.round((sourceHeight * width) / sourceWidth);
    for (const format of formats) {
      variants.push({
        width,
        height,
        format,
        quality: qualityFor(width, format),
        file: `${name}-${width}.${format}`,
      });
    }
  }

  return { variants, skipped };
}

/** Parses argv (without `node script`); throws on an unknown flag or a missing value. */
export function parseArgs(argv) {
  const options = {
    widths: DEFAULT_WIDTHS,
    formats: ["webp"],
    dryRun: false,
    name: undefined,
    positional: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`${arg} needs a value`);
      }
      i += 1;
      return next;
    };

    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--name") {
      options.name = value();
    } else if (arg === "--widths") {
      const widths = value()
        .split(",")
        .map((part) => Number(part.trim()));
      if (widths.some((width) => !Number.isInteger(width) || width <= 0)) {
        throw new Error(`--widths takes positive integers, got "${argv[i]}"`);
      }
      options.widths = widths;
    } else if (arg === "--formats") {
      const formats = value()
        .split(",")
        .map((part) => part.trim());
      const unknown = formats.filter((format) => !FORMATS.includes(format));
      if (unknown.length) {
        throw new Error(`unknown format: ${unknown.join(", ")}`);
      }
      options.formats = formats;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      options.positional.push(arg);
    }
  }

  if (options.positional.length !== 2) {
    throw new Error(
      "usage: make-image-variants.mjs <source> <out-dir> [--name <base>] [--widths 480,768] [--formats webp,avif] [--dry-run]",
    );
  }

  return options;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

export async function run(argv, log = console.log) {
  const options = parseArgs(argv);
  const [source, outDir] = options.positional;
  const name = options.name ?? path.basename(source, path.extname(source));

  const { default: sharp } = await import("sharp");
  const meta = await sharp(source).metadata();
  const { variants, skipped } = planVariants({
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    widths: options.widths,
    formats: options.formats,
    name,
  });

  log(`source ${source}: ${meta.width}x${meta.height} ${meta.format}`);
  for (const width of skipped) {
    log(`skip ${width}: wider than the source`);
  }

  if (options.dryRun) {
    for (const variant of variants) {
      log(
        `would write ${path.join(outDir, variant.file)} ${variant.width}x${variant.height} q${
          variant.quality
        }`,
      );
    }
    log(`dry run: ${variants.length} file(s) planned, nothing written`);
    return { variants, skipped, written: [] };
  }

  await mkdir(outDir, { recursive: true });
  const written = [];

  for (const variant of variants) {
    const target = path.join(outDir, variant.file);
    const pipeline = sharp(source).resize({ width: variant.width, withoutEnlargement: true });
    if (variant.format === "avif") {
      await pipeline.avif({ quality: variant.quality, effort: 4 }).toFile(target);
    } else {
      await pipeline.webp({ quality: variant.quality, effort: 5, smartSubsample: true }).toFile(target);
    }
    const { size } = await stat(target);
    written.push({ ...variant, bytes: size });
    log(`wrote ${target} ${variant.width}x${variant.height} q${variant.quality} ${kb(size)}`);
  }

  const total = written.reduce((sum, variant) => sum + variant.bytes, 0);
  const manifest = {
    source: path.basename(source),
    width: meta.width,
    height: meta.height,
    variants: written.map(({ file, width, height, format, quality, bytes }) => ({
      file,
      width,
      height,
      format,
      quality,
      bytes,
    })),
    total_bytes: total,
  };
  await writeFile(path.join(outDir, `${name}.variants.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  log(`total ${written.length} file(s), ${kb(total)}`);

  return { variants, skipped, written };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(`make-image-variants: ${error.message}`);
    process.exit(1);
  });
}
