import type { MedusaContainer } from "@medusajs/framework/types";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { tenantFilePrefix } from "../../tenant-files";
import { fetchImage } from "../images";
import type { ImageOutcome } from "../plan";

/**
 * The images of an import, fetched and uploaded once per address.
 *
 * `../apply.ts` runs these steps and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

type ImageResolution = {
  /** URLs to put on the product, in row order, after uploading. */
  urls: string[];
  outcomes: ImageOutcome[];
};

/**
 * Image URLs turned into images the shop owns. A URL already on the product is
 * kept as it is: a round trip of the export must not re-download the shop's own
 * files, and the export writes the stored URLs out.
 */
export const resolveImages = async ({
  container,
  tenantId,
  urls,
  existing,
}: {
  container: MedusaContainer;
  tenantId: string;
  urls: string[];
  existing: string[];
}): Promise<ImageResolution> => {
  const outcomes: ImageOutcome[] = [];
  const resolved: string[] = [];

  for (const [index, url] of urls.entries()) {
    if (existing.includes(url)) {
      resolved.push(url);
      outcomes.push({ ok: true, url });
      continue;
    }

    const fetched = await fetchImage(url, index);

    if (!fetched.ok) {
      outcomes.push({ ok: false, url, error: fetched.error });
      continue;
    }

    const { result } = await uploadFilesWorkflow(container).run({
      input: {
        files: [
          {
            filename: `${tenantFilePrefix(tenantId)}${fetched.filename}`,
            mimeType: fetched.mime_type,
            content: fetched.content.toString("base64"),
            access: "public" as const,
          },
        ],
      },
    });

    const stored = result[0]?.url;

    if (!stored) {
      outcomes.push({ ok: false, url, error: "файл не удалось сохранить в магазине" });
      continue;
    }

    resolved.push(stored);
    outcomes.push({ ok: true, url });
  }

  return { urls: resolved, outcomes };
};
