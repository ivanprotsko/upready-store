import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework";

/**
 * A handle is free only when no shop answers on it AND no shop ever did.
 *
 * The second half is `specs/tenant-address/CANONICAL.md` §1.2: a handle a shop
 * has released keeps its inbound links and its history in search, so handing it
 * to another tenant would give that tenant someone else's reputation and break
 * the 301 the old owner's visitors still follow. The reservation has no expiry
 * while the shop is alive.
 *
 * Called from the two creation workflows and from the address change itself, so
 * the rule cannot hold in one entry point and not in the other (rule 20).
 */
export const assertHandleAvailable = async (
  container: MedusaContainer,
  handle: string,
  { exceptTenantId }: { exceptTenantId?: string } = {},
): Promise<void> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id"],
    filters: { handle: [handle] },
  });

  const takenByTenant = tenants.find((tenant) => tenant?.id !== exceptTenantId);

  if (takenByTenant) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `Address "${handle}" is already taken by another shop.`,
    );
  }

  const { data: aliases } = await query.graph({
    entity: "tenant_handle_alias",
    fields: ["id", "tenant.id"],
    filters: { handle: [handle] },
  });

  const reservedByOther = aliases.find(
    (alias) => (alias?.tenant?.id as string | undefined) !== exceptTenantId,
  );

  if (reservedByOther) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `Address "${handle}" belonged to another shop before and stays reserved for it.`,
    );
  }
};
