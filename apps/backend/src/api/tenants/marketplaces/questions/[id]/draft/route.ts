import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { saveDraft } from "../../../draft-handlers";

/**
 * `POST /tenants/marketplaces/questions/:id/draft` — the owner's own answer to
 * a customer question, stored in OUR database (w18-mp-reviews-desk).
 *
 * Answering on Ozon is `POST /v1/question/answer/create`, on the mutation
 * deny-list; Wildberries answers questions with `PATCH /api/v1/questions`, a
 * verb the registry refuses outright. Neither is reachable from here.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  saveDraft(req, res, "questions");
