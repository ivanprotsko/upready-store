import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { printCdekLabels } from "../../../../../cdek/print";
import {
  cdekCredentialsFor,
  parseBatchBody,
  resolveCdekPrintTargets,
  sendCdekPrintError,
  sendPdf,
} from "../helpers";

/**
 * `POST /tenants/orders/cdek/labels` with `{ fulfillment_ids: string[], format? }`
 * — the CDEK labels of up to 100 fulfillments in one PDF, from one
 * `/print/barcodes` call (t-2026-10-14-58, part A). One id that is not a CDEK
 * fulfillment of the caller's shop refuses the whole request
 * (`tenants/orders/cdek/helpers.ts`).
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  try {
    const { fulfillment_ids, format } = parseBatchBody(req.body);
    const targets = await resolveCdekPrintTargets(req, fulfillment_ids);
    const credentials = await cdekCredentialsFor(req, targets);
    const { pdf } = await printCdekLabels(
      credentials,
      targets.map((target) => target.order_uuid),
      format,
    );
    sendPdf(
      res,
      pdf,
      targets.length === 1 ? `cdek-label-${targets[0].display_id}.pdf` : `cdek-labels-${targets.length}.pdf`,
    );
  } catch (error) {
    sendCdekPrintError(req, res, error);
  }
};
