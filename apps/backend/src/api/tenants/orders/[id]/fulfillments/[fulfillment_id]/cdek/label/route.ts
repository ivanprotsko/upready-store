import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { printCdekLabels } from "../../../../../../../../cdek/print";
import {
  cdekCredentialsFor,
  parseLabelFormat,
  resolveCdekPrintTargets,
  sendCdekPrintError,
  sendPdf,
} from "../../../../../cdek/helpers";

/**
 * `GET /tenants/orders/:id/fulfillments/:fulfillment_id/cdek/label?format=A4|A5|A6`
 * — the CDEK parcel label of one fulfillment as a PDF, A6 unless asked
 * otherwise (t-2026-10-14-58, part A). The checks and the error answers are in
 * `tenants/orders/cdek/helpers.ts`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  try {
    const format = parseLabelFormat((req.query as Record<string, unknown>)?.format);
    const targets = await resolveCdekPrintTargets(req, [req.params.fulfillment_id], req.params.id);
    const credentials = await cdekCredentialsFor(req, targets);
    const { pdf } = await printCdekLabels(credentials, [targets[0].order_uuid], format);
    sendPdf(res, pdf, `cdek-label-${targets[0].display_id}.pdf`);
  } catch (error) {
    sendCdekPrintError(req, res, error);
  }
};
