import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  applySiteSection,
  revertSiteSection,
  type AppliedSiteSection,
  type SiteSection,
} from "../../../../tenant-sites/site-section";

/** Writes the source's site section into the new site; the compensation takes exactly those rows back. */
const applySiteSectionStep = createStep(
  "apply-site-section",
  async (input: { tenant_id: string; site: SiteSection; pages: boolean }, { container }) => {
    const applied = await applySiteSection(container, input.tenant_id, input.site, { pages: input.pages });
    return new StepResponse(applied, applied);
  },
  async (applied: AppliedSiteSection | undefined, { container }) => {
    if (applied) {
      await revertSiteSection(container, applied);
    }
  },
);

export default applySiteSectionStep;
