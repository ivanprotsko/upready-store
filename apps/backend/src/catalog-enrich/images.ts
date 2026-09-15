/**
 * Which Wildberries photo an image of the catalog already IS
 * (w07-tenant-catalog-enrich).
 *
 * Two facts decide the whole design here.
 *
 * The cover must not move. The shop's first image is a product shot on a clean
 * white background, it is what `product.thumbnail` points at and what every
 * catalogue tile shows, and Ivan's order of 2026-09-16 04:44 WITA names it
 * («сохрани наши картинки, с белым чистым фоном которые стоят первыми в
 * качестве обложки товара»). So WB photos are APPENDED after the last existing
 * image and the thumbnail is left alone.
 *
 * The catalog already carries WB photos. The 2026-09-12 migration downloaded
 * them from the same cards and stored them as `<timestamp>-<nmID>__<n>.webp`
 * (measured on the stand: 25 of 38 products have such files). Re-encoded on the
 * way, so the bytes differ from a fresh download — nmID 219762882 photo 1 is
 * 107 144 bytes at WB and 90 614 bytes in the catalog, different SHA-256 — and
 * a content hash therefore proves nothing. What DOES identify the photo is the
 * pair the file name already carries: the card it came from and its position
 * in that card. That pair is the dedupe key, and an image this script adds
 * records it in `metadata` so the key survives a file name the provider
 * chooses itself.
 */

/** `wb:<nmID>:<position>` — one photo of one card, however it was stored. */
export type PhotoKey = string;

export const photoKey = (nmId: string, index: number): PhotoKey => `wb:${nmId}:${index}`;

/**
 * The key a WB photo URL stands for.
 *
 * The item number and the photo's position are both IN the URL
 * (`…/vol943/part94372/94372564/images/big/1.webp`), which is what lets an
 * image added by an earlier run be recognised from its `metadata.wb_source_url`
 * alone.
 */
export const keyFromWbUrl = (url: string | null | undefined): PhotoKey | null => {
  const match = /\/(\d{4,})\/images\/[a-z0-9x]+\/(\d+)\.[a-z]+$/i.exec(String(url ?? ""));
  return match ? photoKey(match[1], Number(match[2])) : null;
};

/**
 * The key an image ALREADY in the catalog stands for, or `null` when it is not
 * a WB photo.
 *
 * `metadata.wb_source_url` is what this script writes. The file name pattern
 * `<anything>-<nmID>__<n>.<ext>` is what the 2026-09-12 migration wrote, and it
 * is read here so a second source of the same photo is not appended next to the
 * first one. A double underscore separates the two numbers in that pattern, so
 * a plain timestamped upload («1789180156900-photo.webp») matches nothing.
 */
export const keyFromCatalogImage = (image: {
  url: string;
  metadata?: Record<string, unknown> | null;
}): PhotoKey | null => {
  const recorded = image.metadata?.wb_source_url;
  if (typeof recorded === "string" && recorded) {
    const fromUrl = keyFromWbUrl(recorded);
    if (fromUrl) {
      return fromUrl;
    }
  }

  const recordedKey = image.metadata?.wb_photo_key;
  if (typeof recordedKey === "string" && /^wb:\d+:\d+$/.test(recordedKey)) {
    return recordedKey;
  }

  const fileName = String(image.url ?? "").split("/").pop() ?? "";
  const match = /(?:^|[^0-9])(\d{6,})__(\d+)\.[a-z0-9]+$/i.exec(fileName);
  return match ? photoKey(match[1], Number(match[2])) : null;
};

export type PhotoPlan = {
  /** Photos to download and append, in the card's own order. */
  append: { index: number; url: string; key: PhotoKey }[];
  /** Photos the product already carries, by the key that proved it. */
  skipped: { index: number; url: string; key: PhotoKey }[];
};

/**
 * What an enrichment run would do to one product's gallery.
 *
 * Pure: it decides from the lists alone, so the same plan can be printed by a
 * `--dry-run` and executed by an `--apply` without the two ever disagreeing.
 */
export const planPhotos = (
  existing: { url: string; metadata?: Record<string, unknown> | null }[],
  photos: { index: number; url: string }[],
): PhotoPlan => {
  const held = new Set<PhotoKey>();
  for (const image of existing) {
    const key = keyFromCatalogImage(image);
    if (key) {
      held.add(key);
    }
  }

  const plan: PhotoPlan = { append: [], skipped: [] };
  for (const photo of photos) {
    const key = keyFromWbUrl(photo.url) ?? photoKey("0", photo.index);
    if (held.has(key)) {
      plan.skipped.push({ ...photo, key });
      continue;
    }
    held.add(key);
    plan.append.push({ ...photo, key });
  }

  return plan;
};
