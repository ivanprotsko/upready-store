import { z } from "@medusajs/framework/zod";

/**
 * Body of `POST /tenants/products/:id/packshot`. JSON carries `source_url`; a
 * multipart request carries the picture in `files` and the options as a JSON
 * string in the `options` field, because multer hands every text field over as a
 * string.
 */
export const PackshotOptionsSchema = z
  .object({
    engine: z.enum(["auto", "local", "bria"]).default("auto"),
    shadow: z.boolean().default(true),
    mode: z.enum(["exact", "rerender"]).default("exact"),
  })
  .strict();

export const PostPackshotSchema = z
  .object({
    source_url: z.string().min(1).max(2048).optional(),
    options: z.preprocess((raw) => {
      if (typeof raw !== "string") return raw;

      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }, PackshotOptionsSchema.default({ engine: "auto", shadow: true, mode: "exact" })),
  })
  .strict();

export type PostPackshot = z.infer<typeof PostPackshotSchema>;
