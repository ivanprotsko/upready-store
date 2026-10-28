import type { ExecArgs, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { readRegionRedirects } from "../api/storefront/by-host/region-redirects";

/**
 * Sends one country's buyers to another shop (t-2026-10-20-22). Ivan,
 * 20.10.2026: «нужно сделать попап с выбором региона и если человек выбирает
 * "россия", то пусть выполняется переадресация на сайт cherkashino.ru».
 *
 * Writes `tenant.metadata.region_redirects[<country>] = <url>`, merged with
 * everything else in `metadata`. `/storefront/by-host` answers it as
 * `region_redirects` (`api/storefront/by-host/region-redirects.ts`), and the
 * storefront then asks a first-time visitor the region and sends a «Россия»
 * pick to the other shop's home. A shop without the key shows no popup.
 *
 *   npx medusa exec ./src/scripts/set-tenant-region-redirect.js tenant=<handle> country=ru url=https://cherkashino.ru          (prints the plan, writes nothing)
 *   npx medusa exec ./src/scripts/set-tenant-region-redirect.js tenant=<handle> country=ru url=https://cherkashino.ru apply    (writes)
 *   live: docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/set-tenant-region-redirect.js tenant=cherkashino-com country=ru url=https://cherkashino.ru apply
 *
 * Idempotent: a second run changes nothing once the country already points at
 * the same address.
 */
const readArg = (args: string[], name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

export default async function setTenantRegionRedirect({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const apply = args.includes("apply");
  const handle = readArg(args, "tenant");
  const country = readArg(args, "country")?.trim().toLowerCase();
  const url = readArg(args, "url")?.trim();

  if (!handle || !country || !url) {
    throw new Error(
      "set-tenant-region-redirect: pass tenant=<handle> country=<iso_2> url=<https://…> (and apply to write)",
    );
  }

  // The same reader the storefront's answer goes through, so a value this
  // script writes is one `/storefront/by-host` will actually hand out.
  const [parsed] = readRegionRedirects({ region_redirects: { [country]: url } });
  if (!parsed) {
    throw new Error(
      `set-tenant-region-redirect: "${country}" → "${url}" is not a two-letter country and an http(s) address`,
    );
  }

  const tenantModuleService = container.resolve<TenantModuleService>(TENANT_MODULE);
  const [tenant] = await tenantModuleService.listTenants({ handle });
  if (!tenant) {
    throw new Error(`set-tenant-region-redirect: tenant "${handle}" was not found`);
  }

  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const current = readRegionRedirects(metadata).find((r) => r.country === parsed.country);

  logger.info(
    `set-tenant-region-redirect: ${handle} — "${parsed.country}" ${current?.url ?? "(none)"} -> ${parsed.url}`,
  );

  if (current?.url === parsed.url) {
    logger.info(`set-tenant-region-redirect: ${handle} already sends "${parsed.country}" to ${parsed.url}, nothing to do`);
    return;
  }

  if (!apply) {
    logger.info("set-tenant-region-redirect: dry run, nothing written; pass apply to write");
    return;
  }

  const block = metadata.region_redirects;
  const redirects =
    block && typeof block === "object" && !Array.isArray(block) ? (block as Record<string, unknown>) : {};

  await tenantModuleService.updateTenants({
    id: tenant.id,
    metadata: { ...metadata, region_redirects: { ...redirects, [parsed.country]: parsed.url } },
  });

  logger.info(`set-tenant-region-redirect: ${handle} now sends "${parsed.country}" to ${parsed.url}`);
}
