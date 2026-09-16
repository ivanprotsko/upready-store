import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { suggestDraft } from "../../../draft-handlers";

/**
 * `POST /tenants/marketplaces/questions/:id/suggest` — a draft the owner may
 * accept, edit or ignore (w18-mp-reviews-desk).
 *
 * Local template, no network, no saving of its own output, and 400 with the
 * reason when no generator is configured.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  suggestDraft(req, res, "questions");
