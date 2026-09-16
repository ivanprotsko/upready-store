import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { saveDraft } from "../../../draft-handlers";

/**
 * `POST /tenants/marketplaces/reviews/:id/draft` — the owner's own answer,
 * stored in OUR database (w18-mp-reviews-desk).
 *
 * This is not a send and there is no send: answering on Wildberries is
 * `POST /api/v1/feedbacks/answer`, which stands in the WB mutation deny-list
 * and cannot be registered as a read. The draft is copied into the
 * marketplace's own cabinet by hand.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  saveDraft(req, res, "reviews");
