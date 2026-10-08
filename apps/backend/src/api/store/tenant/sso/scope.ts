import type { ICacheService, ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import type { SsoCodeStore, SsoLock } from "./school-sso";

/**
 * Where the codes live: Medusa's cache module, in process memory by default
 * and on Redis once `src/config/redis.ts` switches it there, with the locking
 * module (in memory, or Redis alongside) making a redeem one at a time per
 * code. Both are registered by `defineConfig` on every deployment, so nothing
 * new has to be configured.
 */
export const ssoCodeStore = (scope: MedusaContainer): SsoCodeStore =>
  scope.resolve<ICacheService>(Modules.CACHE);

export const ssoLock = (scope: MedusaContainer): SsoLock => {
  const locking = scope.resolve<ILockingModule>(Modules.LOCKING);

  return (key, job) => locking.execute(key, job);
};
