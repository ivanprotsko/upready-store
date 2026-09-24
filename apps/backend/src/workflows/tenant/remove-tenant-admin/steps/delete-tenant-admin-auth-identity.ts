import { Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { TENANT_ACTOR_TYPE, TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type DeleteTenantAdminAuthIdentityStepInput = { email: string };

const ENTITY_ID_KEY = `${TENANT_ACTOR_TYPE}_id`;

/**
 * Deletes the emailpass auth identity behind a tenant admin's email — but
 * ONLY when nothing else still needs it (o25-platform-admin-all-shops: the
 * same email, and the same identity, can now hold a `tenant_admin` row in
 * several tenants, `PLATFORM_ADMIN_EMAIL` chief among them):
 *
 * - `removeTenantAdminWorkflow` runs `deleteTenantAdminRowStep` BEFORE this
 *   one, so a `listTenantAdmins({ email })` read here already excludes the
 *   row just removed; anything still in the list is a DIFFERENT tenant's
 *   admin sharing this email, and its login must survive.
 * - An identity carrying `app_metadata.user_id` is also a Medusa Admin
 *   `user`'s login (the platform admin, or staff who doubles as a tenant
 *   admin); removing them from one shop must never lock them out of
 *   `/app`.
 * - When the identity survives, its `app_metadata.tenant_id` — the DEFAULT
 *   row the next plain login opens (`generateJwtTokenForAuthIdentity`) — is
 *   repointed to a surviving row if it still names the one just removed.
 *   Left stale, the next login answers 200 (the identity is real) but mints
 *   a token whose `actor_id` is a `tenant_admin` id that no longer exists:
 *   every `/tenants/*` call after it 404s "Tenant admin ... was not found",
 *   so the login LOOKS alive and is dead everywhere (review finding,
 *   PR #140, caught before merge). No compensation for the repoint: nothing
 *   runs after this step, and app_metadata restores cheaply if it ever
 *   needed to.
 *
 * No compensation is possible for a deleted identity (the password hash is
 * gone with it), which is why `removeTenantAdminWorkflow` runs this step
 * last, after the `tenant_admin` row (which CAN be restored) is already
 * gone.
 */
const deleteTenantAdminAuthIdentityStep = createStep(
  "delete-tenant-admin-auth-identity",
  async (input: DeleteTenantAdminAuthIdentityStepInput, { container }) => {
    const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const remainingRows = await tenantModuleService.listTenantAdmins({ email: input.email });

    if (remainingRows.length > 0) {
      const [identity] = await authModuleService.listAuthIdentities({
        provider_identities: { entity_id: input.email, provider: "emailpass" },
      });

      const currentDefault = identity?.app_metadata?.[ENTITY_ID_KEY] as string | undefined;
      const defaultStillValid =
        currentDefault && remainingRows.some((row) => row.id === currentDefault);

      if (identity && !defaultStillValid) {
        await authModuleService.updateAuthIdentities({
          id: identity.id,
          app_metadata: {
            ...(identity.app_metadata ?? {}),
            [ENTITY_ID_KEY]: remainingRows[0].id,
          },
        });
      }

      return new StepResponse({ deleted: false });
    }

    const [identity] = await authModuleService.listAuthIdentities({
      provider_identities: { entity_id: input.email, provider: "emailpass" },
    });

    if (identity && !identity.app_metadata?.user_id) {
      await authModuleService.deleteAuthIdentities([identity.id]);
      return new StepResponse({ deleted: true });
    }

    return new StepResponse({ deleted: false });
  },
);

export default deleteTenantAdminAuthIdentityStep;
