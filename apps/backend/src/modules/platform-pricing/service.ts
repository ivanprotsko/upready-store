import { MedusaError, MedusaService } from "@medusajs/framework/utils";
import PlatformPricing from "./models/platform-pricing";
import type { PricingDocument } from "./schema";

/** The one page this stage has. */
export const DEFAULT_PRICING_HANDLE = "default";

export type StoredPricing = {
  id: string;
  handle: string;
  document: unknown;
  revision: number;
  updated_by: string | null;
  updated_at: Date | string;
};

class PlatformPricingModuleService extends MedusaService({
  PlatformPricing,
}) {
  /** The stored page, or null when nobody has saved or seeded one yet. */
  async retrievePage(handle: string = DEFAULT_PRICING_HANDLE): Promise<StoredPricing | null> {
    const [row] = await this.listPlatformPricings({ handle }, { take: 1 });
    return (row as StoredPricing | undefined) ?? null;
  }

  /**
   * Writes the page. `expectedRevision` is the revision the caller read: null
   * means "create", and is refused when a page already exists; a number must
   * match the stored one. A mismatch is a 409 the editor has to resolve by
   * reloading, never a silent last-write-wins.
   */
  async savePage(input: {
    document: PricingDocument;
    expectedRevision: number | null;
    updatedBy: string | null;
    handle?: string;
  }): Promise<StoredPricing> {
    const handle = input.handle ?? DEFAULT_PRICING_HANDLE;
    const current = await this.retrievePage(handle);

    if (!current) {
      if (input.expectedRevision !== null) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          `The pricing page "${handle}" does not exist, so revision ${input.expectedRevision} cannot be updated.`,
        );
      }
      const created = await this.createPlatformPricings({
        handle,
        document: input.document as unknown as Record<string, unknown>,
        revision: 1,
        updated_by: input.updatedBy,
      });
      return created as unknown as StoredPricing;
    }

    if (input.expectedRevision !== current.revision) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `The pricing page changed since it was loaded (revision ${current.revision}, the editor had ${input.expectedRevision ?? "none"}). Reload it and apply the change again.`,
      );
    }

    const updated = await this.updatePlatformPricings({
      id: current.id,
      document: input.document as unknown as Record<string, unknown>,
      revision: current.revision + 1,
      updated_by: input.updatedBy,
    });
    return updated as unknown as StoredPricing;
  }
}

export default PlatformPricingModuleService;
