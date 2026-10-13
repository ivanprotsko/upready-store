import { z } from "@medusajs/framework/zod";
import { BUTTON_STYLES, DENSITIES, PHOTO_STYLES, RADII } from "./validation";

/**
 * `POST /tenants/home/template` (t-2026-10-12-33): which template, and what the owner
 * changes in it. Strict at every level, so an override of anything but the palette, a
 * layer or a section's props is a 400 here, before the route reads a thing. The values
 * themselves are judged by `validation.ts` on the merged template, the palette and the
 * props included.
 */
export const PostTenantHomeTemplateBody = z
  .object({
    id: z.string().min(1).max(64),
    overrides: z
      .object({
        palette: z.string().min(1).max(64).optional(),
        layers: z
          .object({
            radius: z.enum(RADII),
            buttonStyle: z.enum(BUTTON_STYLES),
            photoStyle: z.enum(PHOTO_STYLES),
            density: z.enum(DENSITIES),
          })
          .partial()
          .strict()
          .optional(),
        sections: z
          .array(
            z
              .object({
                index: z.number().int().min(0),
                block: z.string().min(1).max(100),
                props: z.record(z.string(), z.unknown()),
              })
              .strict(),
          )
          .max(50)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type PostTenantHomeTemplateBodyType = z.infer<typeof PostTenantHomeTemplateBody>;
