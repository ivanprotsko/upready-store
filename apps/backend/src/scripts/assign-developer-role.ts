import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  applyDeveloperRolePlan,
  describeDeveloperRolePlan,
  listStaffLogins,
  parseEmailList,
  planDeveloperRoles,
  type DeveloperRolePlan,
} from "../tenant-staff/developer-role";

/**
 * Moves the platform, the developers and the agents' service logins off the
 * `owner` role in every shop of this database (t-2026-10-14-41). The rules
 * live in `src/tenant-staff/developer-role.ts`; this is the tool the lead runs
 * by hand, once, after the release that brings the `developer` role.
 *
 * The addresses come from the environment, which no argument parser in front
 * of the script can reshape, and the repository holds none of them:
 *
 *   PLATFORM_ADMIN_EMAIL   the platform's row in every shop, already in the
 *                          stack's env file
 *   DEVELOPER_EMAILS       comma-separated: who becomes a developer
 *   SERVICE_EMAILS         comma-separated: whose owner role becomes operator
 *
 * A dry run by default: it prints what it would change and changes nothing.
 * `apply` (no dashes: `medusa exec` rejects a `--flag` meant for the script)
 * writes. Idempotent, a second run plans nothing.
 *
 *   DEVELOPER_EMAILS=… SERVICE_EMAILS=… npx medusa exec ./src/scripts/assign-developer-role.ts
 *   DEVELOPER_EMAILS=… SERVICE_EMAILS=… npx medusa exec ./src/scripts/assign-developer-role.ts apply
 */
export default async function assignDeveloperRole({ container, args }: ExecArgs): Promise<DeveloperRolePlan> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const apply = (args ?? []).includes("apply");

  const plan = planDeveloperRoles(await listStaffLogins(container), {
    platformEmail: process.env.PLATFORM_ADMIN_EMAIL,
    developers: parseEmailList(process.env.DEVELOPER_EMAILS),
    services: parseEmailList(process.env.SERVICE_EMAILS),
  });

  if (apply) {
    await applyDeveloperRolePlan(container, plan);
  }

  for (const line of describeDeveloperRolePlan(plan, apply)) {
    logger.info(`assign-developer-role: ${line}`);
  }

  return plan;
}
