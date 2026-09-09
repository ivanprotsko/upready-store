import type { MedusaContainer } from "@medusajs/framework";
import type {
  IAuthModuleService,
  ICustomerModuleService,
  IUserModuleService,
  Logger,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  FeatureFlag,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { createCustomerAccountWorkflow, createUsersWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Converges this stand's two demo logins onto whatever the environment says, on
 * every boot. Run by `apps/backend/docker-entrypoint.sh` after the migrations,
 * the catalog seed and the composition seed:
 *
 *   medusa exec ./src/scripts/ensure-accounts.js
 *
 * It replaces the entrypoint's old `medusa user -e … -p …` call, which could only
 * ever CREATE: on the second boot the create-users workflow raised on the duplicate
 * email and the CLI exited non-zero (node_modules/@medusajs/medusa/dist/commands/
 * user.js:57-77), so a password changed in the env file never reached the database
 * and the stand kept answering to the password it was first created with. That is
 * exactly what happened on stand one, whose admin identity was minted from a
 * superseded MEDUSA_ADMIN_PASSWORD (deploy/README.md, "The database volume was
 * dropped, deliberately").
 *
 * Two accounts, both idempotent, each logging one plain line — created / password
 * updated / unchanged:
 *
 * 1. ADMIN, from MEDUSA_ADMIN_EMAIL + MEDUSA_ADMIN_PASSWORD. When the user row is
 *    missing this mirrors `medusa user` step for step (user.js:26-83): the RBAC
 *    super-admin role when that feature flag is on, `create-users-workflow`, then
 *    `authModuleService.register("emailpass", …)`, then `updateAuthIdentities` with
 *    `app_metadata.user_id`.
 * 2. DEMO CUSTOMER, from DEMO_CUSTOMER_EMAIL + DEMO_CUSTOMER_PASSWORD. When missing
 *    this mirrors `POST /store/customers` (dist/api/store/customers/route.js:12-16):
 *    register an emailpass auth identity, then `createCustomerAccountWorkflow`, which
 *    sets `has_account` from the presence of the auth identity and links
 *    `app_metadata.customer_id` (core-flows dist/customer/workflows/
 *    create-customer-account.js:36-55). first_name "Demo", last_name "User".
 *
 * The password update for an account that already exists goes through
 * `IAuthModuleService.updateProvider("emailpass", { entity_id, password })` — the
 * one call the framework's own password-change route makes
 * (dist/api/auth/[actor_type]/[auth_provider]/update/route.js:12), typed at
 * @medusajs/types/dist/auth/service.d.ts:99. For the emailpass provider `entity_id`
 * IS the email address: its `update()` looks the provider identity up by that value
 * (@medusajs/auth-emailpass/dist/services/emailpass.js:22-40), the same value its
 * `register()` stores (:156).
 *
 * "unchanged" is decided by a real authentication attempt against the current
 * password rather than by comparing hashes: `authenticate("emailpass", …)` is the
 * same call `POST /auth/user/emailpass` makes, so a boot that logs "unchanged" has
 * literally proved the login Ivan is about to use.
 *
 * Nothing here prints a password, and no password is ever written to a log line.
 */

type AccountOutcome = "created" | "password updated" | "unchanged";

const PROVIDER = "emailpass";

function readCredential(emailVar: string, passwordVar: string): { email: string; password: string } | null {
  const email = (process.env[emailVar] ?? "").trim();
  const password = process.env[passwordVar] ?? "";
  if (!email || !password) {
    return null;
  }
  return { email, password };
}

/**
 * Brings the emailpass password for an EXISTING actor to the env value.
 * Returns "unchanged" when the current password already authenticates.
 */
async function convergePassword(
  authModuleService: IAuthModuleService,
  email: string,
  password: string,
  appMetadata: Record<string, string>,
): Promise<AccountOutcome> {
  const authenticated = await authModuleService.authenticate(PROVIDER, {
    body: { email, password },
  });
  if (authenticated.success) {
    return "unchanged";
  }

  const updated = await authModuleService.updateProvider(PROVIDER, {
    entity_id: email,
    password,
  });
  if (updated.success) {
    return "password updated";
  }

  // No emailpass identity for this email yet — the actor row exists but was never
  // given a login (a guest customer promoted by hand, or a user seeded directly).
  // Register one and claim it for the actor we already found.
  const registered = await authModuleService.register(PROVIDER, {
    body: { email, password },
  });
  if (!registered.success || !registered.authIdentity) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `ensure-accounts: could not set the password for ${email}: updateProvider said "${
        updated.error ?? "no reason given"
      }" and register said "${registered.error ?? "no reason given"}".`,
    );
  }

  await authModuleService.updateAuthIdentities({
    id: registered.authIdentity.id,
    app_metadata: { ...(registered.authIdentity.app_metadata ?? {}), ...appMetadata },
  });

  return "password updated";
}

async function ensureAdmin(container: MedusaContainer, logger: Logger): Promise<void> {
  const credential = readCredential("MEDUSA_ADMIN_EMAIL", "MEDUSA_ADMIN_PASSWORD");
  if (!credential) {
    logger.info(
      "ensure-accounts: MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD are not both set — no admin account is ensured.",
    );
    return;
  }

  const { email, password } = credential;
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const userModuleService: IUserModuleService = container.resolve(Modules.USER);

  const [existing] = await userModuleService.listUsers({ email });
  if (existing) {
    const outcome = await convergePassword(authModuleService, email, password, {
      user_id: existing.id,
    });
    logger.info(`ensure-accounts: admin ${email} — ${outcome}.`);
    return;
  }

  // Mirrors node_modules/@medusajs/medusa/dist/commands/user.js:26-83.
  let roles: string[] = [];
  if (FeatureFlag.isFeatureEnabled("rbac")) {
    const rbacModuleService = container.resolve(Modules.RBAC) as {
      listRbacRoles: (filters: { id: string }) => Promise<{ id: string }[]>;
    };
    const superAdminRoles = await rbacModuleService.listRbacRoles({ id: "role_super_admin" });
    if (superAdminRoles.length > 0) {
      roles = [superAdminRoles[0].id];
    }
  }

  const { result: createdUsers } = await createUsersWorkflow(container).run({
    input: { users: [{ email, roles }] },
  });
  const user = createdUsers[0];

  const registered = await authModuleService.register(PROVIDER, {
    body: { email, password },
  });
  if (!registered.success || !registered.authIdentity) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `ensure-accounts: the admin user row for ${email} was created but its login could not be registered: ${
        registered.error ?? "no reason given"
      }.`,
    );
  }

  await authModuleService.updateAuthIdentities({
    id: registered.authIdentity.id,
    app_metadata: { ...(registered.authIdentity.app_metadata ?? {}), user_id: user.id },
  });

  logger.info(
    `ensure-accounts: admin ${email} — created${roles.length > 0 ? " with the super admin role" : ""}.`,
  );
}

async function ensureDemoCustomer(container: MedusaContainer, logger: Logger): Promise<void> {
  const credential = readCredential("DEMO_CUSTOMER_EMAIL", "DEMO_CUSTOMER_PASSWORD");
  if (!credential) {
    logger.info(
      "ensure-accounts: DEMO_CUSTOMER_EMAIL / DEMO_CUSTOMER_PASSWORD are not both set — no demo customer is ensured.",
    );
    return;
  }

  const { email, password } = credential;
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const customerModuleService: ICustomerModuleService = container.resolve(Modules.CUSTOMER);

  // has_account true only: a GUEST customer carrying the same email (someone who
  // checked out without registering) is not this login, and the register workflow
  // below is happy to give that guest an account.
  const [existing] = await customerModuleService.listCustomers({ email, has_account: true });
  if (existing) {
    const outcome = await convergePassword(authModuleService, email, password, {
      customer_id: existing.id,
    });
    logger.info(`ensure-accounts: demo customer ${email} — ${outcome}.`);
    return;
  }

  // Mirrors POST /store/customers: an emailpass identity first, then the account
  // workflow that creates the customer and links it to that identity.
  const registered = await authModuleService.register(PROVIDER, {
    body: { email, password },
  });

  let authIdentityId: string;
  if (registered.success && registered.authIdentity) {
    authIdentityId = registered.authIdentity.id;
  } else {
    // An identity for this email exists and is already claimed, yet no customer with
    // an account carries the email — reuse that identity and set its password.
    const [providerIdentity] = await authModuleService.listProviderIdentities({
      provider: PROVIDER,
      entity_id: email,
    });
    // `auth_identity_id` is optional on ProviderIdentityDTO
    // (@medusajs/types/dist/auth/common/auth-identity.d.ts), so an identity that
    // carries none is as unusable here as no identity at all.
    if (!providerIdentity?.auth_identity_id) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `ensure-accounts: could not register a login for the demo customer ${email}: ${
          registered.error ?? "no reason given"
        }.`,
      );
    }
    authIdentityId = providerIdentity.auth_identity_id;
    await authModuleService.updateProvider(PROVIDER, { entity_id: email, password });
  }

  const { result: customer } = await createCustomerAccountWorkflow(container).run({
    input: {
      customerData: { email, first_name: "Demo", last_name: "User" },
      authIdentityId,
    },
  });

  logger.info(`ensure-accounts: demo customer ${email} — created (${customer.id}).`);
}

export default async function ensureAccounts({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  await ensureAdmin(container, logger);
  await ensureDemoCustomer(container, logger);
}
