import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { printCdekWaybill } from "../../../../../../../../cdek/print";
import {
  cdekCredentialsFor,
  resolveCdekPrintTargets,
  sendCdekPrintError,
  sendPdf,
} from "../../../../../cdek/helpers";

/**
 * `GET /tenants/orders/:id/fulfillments/:fulfillment_id/cdek/waybill` — the
 * CDEK receipt of one fulfillment as a PDF, two copies (t-2026-10-14-58,
 * part A). The checks and the error answers are in `tenants/orders/cdek/helpers.ts`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  try {
    const targets = await resolveCdekPrintTargets(req, [req.params.fulfillment_id], req.params.id);
    const credentials = await cdekCredentialsFor(req, targets);
    const { pdf } = await printCdekWaybill(credentials, targets[0].order_uuid);
    sendPdf(res, pdf, `cdek-receipt-${targets[0].display_id}.pdf`);
  } catch (error) {
    sendCdekPrintError(req, res, error);
  }
};
