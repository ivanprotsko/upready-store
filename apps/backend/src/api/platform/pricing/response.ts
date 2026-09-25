import { MedusaError } from "@medusajs/framework/utils";
import { PricingDocumentSchema, type PricingDocument } from "../../../modules/platform-pricing/schema";
import type { StoredPricing } from "../../../modules/platform-pricing/service";

export type PricingResponse = {
  pricing: PricingDocument;
  revision: number;
  updated_at: string;
};

/**
 * The stored row as both reads answer it. The document goes through the SAME
 * schema the write used: a row that no longer matches it (a hand edit in SQL,
 * a schema change without a data change) fails here, loudly, instead of
 * reaching the page half-valid.
 */
export function pricingResponse(row: StoredPricing): PricingResponse {
  const parsed = PricingDocumentSchema.safeParse(row.document);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `The stored pricing page (revision ${row.revision}) does not match the schema: ${detail}`,
    );
  }

  return {
    pricing: parsed.data,
    revision: row.revision,
    updated_at: new Date(row.updated_at).toISOString(),
  };
}
