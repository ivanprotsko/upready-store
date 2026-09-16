import { z } from "zod";
import { FBS_ACTIONS } from "../../../../modules/wb-write/fbs-orders";

/**
 * What the FBS desk may ask for (w23-wb-write-fbs-orders).
 *
 * The shape is deliberately narrow: an action name, the orders it applies to
 * and the supply they go into. No method, no path, no body — those come from
 * the write registry, and a request that could name them would be the escape
 * hatch the whole write core exists to not have.
 *
 * `order_ids` are STRINGS because a WB assembly order id is an int64: JSON
 * numbers past 2^53 arrive already rounded, and an id rounded on the way in
 * would cancel a neighbouring order (rule 17a — an identifier is copied, never
 * reconstructed).
 */
export const PostTenantWbFbsActionBody = z
  .object({
    action: z.enum(FBS_ACTIONS),
    order_ids: z.array(z.string().regex(/^\d{1,19}$/)).max(100).optional(),
    supply_id: z.string().min(1).max(64).nullish(),
    supply_name: z.string().min(1).max(128).optional(),
  })
  .strict();

export type PostTenantWbFbsActionBodyType = z.infer<typeof PostTenantWbFbsActionBody>;
