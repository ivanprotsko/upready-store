/**
 * What the import accepts. The numbers are stated in the panel BEFORE the owner
 * picks a file, and enforced here, because a limit discovered after a ten-minute
 * upload is not a limit, it is a waste of an afternoon.
 *
 * They are sized for a shop catalogue, not for a data warehouse: the real shop
 * this was built for has 38 products, and the apply step runs inside the request
 * rather than on a queue, so the ceiling is what a request can finish.
 */

/** 5 MB. A 2000-row catalogue with descriptions is about 1.5 MB. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Data rows, header excluded. */
export const MAX_ROWS = 2000;

/** Image URLs downloaded in one import. */
export const MAX_IMAGE_DOWNLOADS = 500;

/** One image. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Redirects an image URL may take before the importer gives up. */
export const MAX_IMAGE_REDIRECTS = 3;

/** Seconds one image download may take. */
export const IMAGE_TIMEOUT_MS = 15_000;
