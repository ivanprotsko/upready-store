import { z } from "@medusajs/framework/zod";
import { MARKETPLACE_WRITE_OP_CLASSES } from "../../../../modules/marketplace-write/types";

/**
 * `PUT /tenants/wb/write-settings` (w20-wb-write-core).
 *
 * Two independent things the owner can change, and neither of them can send
 * anything to Wildberries on its own: the shop's write switch (gate c) and the
 * consent rows per operation class (gate d). Gate (a) is a credential nobody
 * has, gate (b) reads that credential, and gate (e) is a process environment
 * variable no deployment sets — so this route cannot be the last gate to fall.
 *
 * `op_class` is taken from the core's own list rather than re-spelled here: a
 * class added to `MARKETPLACE_WRITE_OP_CLASSES` must not be silently
 * un-consentable, and a class removed must not stay accepted by the API.
 */
const opClassSchema = z.enum(MARKETPLACE_WRITE_OP_CLASSES);

export const PutTenantWbWriteSettingsBody = z
  .object({
    /** Gate (c). Absent = leave as it is. */
    is_enabled: z.boolean().optional(),
    /**
     * Gate (d), one entry per class the owner is changing. `granted: false`
     * deletes the row, because a consent IS the row: there is no "revoked"
     * state to read wrong later.
     */
    consents: z
      .array(
        z.object({
          op_class: opClassSchema,
          granted: z.boolean(),
          /**
           * What the confirmation dialog told her she was confirming, kept
           * verbatim so "what was she shown" has an answer later.
           */
          note: z.string().max(2000).optional(),
        }),
      )
      .max(MARKETPLACE_WRITE_OP_CLASSES.length)
      .refine(
        (rows) => new Set(rows.map((row) => row.op_class)).size === rows.length,
        { message: "consents must not name the same op_class twice." },
      )
      .optional(),
  })
  .refine((body) => body.is_enabled !== undefined || body.consents !== undefined, {
    message: "Nothing to change: name is_enabled, consents, or both.",
  });

export type PutTenantWbWriteSettingsBodyType = z.infer<typeof PutTenantWbWriteSettingsBody>;
