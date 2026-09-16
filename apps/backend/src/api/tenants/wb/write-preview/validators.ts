import { z } from "@medusajs/framework/zod";
import { WB_DIFF_KINDS } from "../../../../wb-write-diff/types";

/**
 * `GET/PUT /tenants/wb/write-preview` (w21-wb-write-stocks-prices).
 *
 * The GET answers "what would change on WB". The PUT changes exactly one
 * thing and it is not a mutation of Wildberries: which WB seller warehouse a
 * stock location of the shop stands for. Without that pairing the stock diff
 * has nothing to compare and says so; with it, it still cannot send anything,
 * because the five gates of the write core are untouched by this route.
 */
export const GetTenantWbWritePreviewQuery = z.object({
  kind: z.enum(WB_DIFF_KINDS).default("stocks"),
  /** How many rows the screen asks for. The counts below always cover ALL rows. */
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** `differ` is the default view: the table is called "what would change". */
  action: z.enum(["all", "equal", "update", "skipped"]).default("update"),
});

export type GetTenantWbWritePreviewQueryType = z.infer<typeof GetTenantWbWritePreviewQuery>;

export const PutTenantWbWritePreviewBody = z.object({
  /**
   * One entry per location the owner is changing. `wb_warehouse_id: null`
   * clears the pairing, which then shows up in `unmapped_locations` again
   * rather than silently keeping the old number.
   */
  warehouses: z
    .array(
      z.object({
        stock_location_id: z.string().min(1),
        wb_warehouse_id: z.string().min(1).max(64).nullable(),
      }),
    )
    .min(1)
    .max(50)
    .refine(
      (rows) => new Set(rows.map((row) => row.stock_location_id)).size === rows.length,
      { message: "warehouses must not name the same stock_location_id twice." },
    ),
});

export type PutTenantWbWritePreviewBodyType = z.infer<typeof PutTenantWbWritePreviewBody>;
