import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import cloneTenantWorkflow from "../../src/workflows/tenant/clone-tenant";

/**
 * FIXTURE ONLY — t-cherk-34 acceptance. Stands in for «Настройки → Сайты» on a
 * scratch copy of live data: clones the real `olavka` tenant into a second
 * site, `cherkashino-com`, the way the owner will do by hand once she is ready
 * for cherkashino.com. Calls `cloneTenantWorkflow` straight from a script
 * (`POST /tenants/sites` needs a tenant_admin bearer token this stand has no
 * password for), so there is no HTTP hop and no auth to fake.
 *
 *   npx medusa exec ./scripts/fixtures/t-cherk-34-clone-cherkashino-com.ts
 *
 * Not idempotent and not meant to be: running it twice tries to create
 * `cherkashino-com` again and the second call fails on the duplicate handle,
 * which is fine for a one-shot acceptance script against a database nobody
 * else uses.
 */
export default async function cloneCherkashinoCom({ container }: { container: MedusaContainer }) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [source],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "name"],
    filters: { handle: "olavka" },
  });

  if (!source?.id) {
    logger.error("t-cherk-34 fixture: no tenant with handle \"olavka\" on this database.");
    return;
  }

  const { result } = await cloneTenantWorkflow(container).run({
    input: {
      source_tenant_id: source.id as string,
      name: "Cherkashino.com",
      handle: "cherkashino-com",
      admin: { email: "admin@test.com", first_name: "Stand", last_name: "Admin" },
      copy_pages: true,
      copy_shipping: true,
    },
  });

  logger.info(
    `t-cherk-34 fixture: cloned "${source.handle}" (${source.id}) -> "${result.tenant.handle}" (${result.tenant.id}). ` +
      `Open it at http://${result.tenant.handle}.localhost:8680/`,
  );
}
