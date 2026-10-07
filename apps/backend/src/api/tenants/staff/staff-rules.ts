import type { IAuthModuleService, MedusaContainer } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { TENANT_ACTOR_TYPE, TENANT_MODULE } from "../../../modules/tenant";
import type { TenantAdminRole } from "../../../modules/tenant/models/tenant-admin";
import type TenantModuleService from "../../../modules/tenant/service";
import { isPlatformAdminEmail } from "../../admin/tenants/helpers";
import { STAFF_REFUSALS } from "./staff-refusals";

/**
 * The rules of a shop's logins that do not depend on who is asking
 * (t-2026-10-07-11). Two namespaces edit the same rows, the owner through
 * `/tenants/staff` and platform staff through `/admin/tenants/:id/admins`, so
 * what both must refuse lives here once.
 */

export type StaffRow = {
  id: string;
  email: string;
  role: TenantAdminRole;
  tenant_id?: string | null;
};

const PROVIDER = "emailpass";
const ACTOR_KEY = `${TENANT_ACTOR_TYPE}_id`;

/**
 * The platform's own row (`PLATFORM_ADMIN_EMAIL`, one in every shop). It is
 * not the shop's staff: the owner does not see it and cannot touch it, and it
 * never counts as one of the shop's owners.
 */
export const isPlatformRow = (row: { email?: string | null }): boolean => isPlatformAdminEmail(row.email);

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message);

/**
 * A shop always keeps one owner of its own. Without one nobody in the shop
 * could add a login or change a role, and the only way back would be the
 * platform. `rows` is every login of the shop; the platform's row is skipped,
 * or an owner could remove herself and leave only the platform behind.
 */
export const assertAnotherOwnerStays = (rows: StaffRow[], target: StaffRow, action: "remove" | "demote") => {
  if (target.role !== "owner" || isPlatformRow(target)) {
    return;
  }

  const otherOwners = rows.filter(
    (row) => row.id !== target.id && row.role === "owner" && !isPlatformRow(row),
  );

  if (otherOwners.length === 0) {
    throw invalid(action === "remove" ? STAFF_REFUSALS.last_owner_remove : STAFF_REFUSALS.last_owner_demote);
  }
};

/**
 * Whether ANY emailpass identity answers to `email`: another shop's login, a
 * platform user, a buyer of any storefront (all three live in one table and
 * differ only by `app_metadata`), or an identity somebody registered and never
 * used.
 */
const findIdentity = async (container: MedusaContainer, email: string) => {
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

  const [identity] = await authModuleService.listAuthIdentities({
    provider_identities: { entity_id: email, provider: PROVIDER },
  });

  return identity ?? null;
};

/**
 * Creating a login sets a password. If the email already has an identity, that
 * password would be somebody else's: the person works in another shop, or
 * buys in one, or the identity was registered in advance by whoever wants to
 * be let in under this email. Attaching the row and keeping the old password
 * is no better, because nothing here proves who knows that password. So the
 * owner is refused, in words she can act on, and nothing is created.
 */
export const assertEmailHasNoIdentity = async (container: MedusaContainer, email: string) => {
  if (await findIdentity(container, email)) {
    throw invalid(STAFF_REFUSALS.email_has_account);
  }
};

/**
 * Changing a password changes it for the IDENTITY, and one identity can be
 * the login of several things. The owner may set a new password only for an
 * identity that is this one row's and nothing else's: no row under the same
 * email in another shop (a row the switch into a sister site made counts like
 * any other), and no other actor (`user_id`, `customer_id`) on the
 * identity. Otherwise the owner of one shop would walk into another shop, the
 * platform or a buyer's account with a password of her own choosing.
 */
export const assertPasswordIsThisShopsOnly = async (container: MedusaContainer, target: StaffRow) => {
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantAdmins({ email: target.email });
  const identity = await findIdentity(container, target.email);
  const otherActors = Object.keys(identity?.app_metadata ?? {}).filter((key) => key !== ACTOR_KEY);

  if (rows.some((row) => row.id !== target.id) || otherActors.length > 0) {
    throw invalid(STAFF_REFUSALS.password_shared);
  }
};
