import type { MedusaContainer } from "@medusajs/framework/types";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";

/**
 * How long a published changeset is kept (t-2026-10-27-04): 90 days after it
 * was published, rolled back or not. A draft or a staged one is never removed
 * here: it is still the owner's to decide on.
 */
export const KEEP_PUBLISHED_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export const publishedCutoff = (now: Date): Date => new Date(now.getTime() - KEEP_PUBLISHED_DAYS * DAY_MS);

/** Removes the rows past the cutoff and answers how many. */
export const removeOldPublishedChangesets = async (container: MedusaContainer, now = new Date()): Promise<number> => {
  const service: TenantModuleService = container.resolve(TENANT_MODULE);
  const old = await service.listAgentChangesets(
    { status: ["published", "rolled_back"], published_at: { $lt: publishedCutoff(now) } },
    { select: ["id"], take: 1000 },
  );
  if (!old.length) return 0;
  await service.deleteAgentChangesets(old.map((row) => row.id));
  return old.length;
};
