import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { removeOldPublishedChangesets } from "../agent-changesets/cleanup";

/**
 * Once a night: the owner's agent's changesets published more than 90 days
 * ago are removed, snapshot and all (t-2026-10-27-04,
 * `agent-changesets/cleanup.ts`). Up to 1000 a night; the rest go the next.
 */
export default async function agentChangesetCleanupJob(container: MedusaContainer) {
  const removed = await removeOldPublishedChangesets(container);
  if (removed) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(`[agent-changesets] removed ${removed} changeset(s) published over 90 days ago`);
  }
}

export const config = {
  name: "agent-changeset-cleanup",
  schedule: "17 3 * * *",
};
