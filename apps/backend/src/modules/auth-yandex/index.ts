import { ModuleProvider, Modules } from "@medusajs/framework/utils";

import { YandexAuthService } from "./services/yandex";

/**
 * Yandex ID provider for the Medusa auth module.
 *
 * Registered from `medusa-config.ts` as `./src/modules/auth-yandex` with id
 * "yandex", which is what exposes `/auth/customer/yandex` and
 * `/auth/customer/yandex/callback`.
 *
 * Declaring the auth module in `medusa-config.ts` REPLACES Medusa's own default
 * registration (`resolveModules` in `@medusajs/utils/dist/common/define-config.js`
 * adds the module with `providers: [emailpass]`, and the user entry wins by
 * service name in `transformModules`), so `emailpass` has to be listed there
 * explicitly next to this one or every email-and-password login dies with it.
 */
export default ModuleProvider(Modules.AUTH, {
  services: [YandexAuthService],
});
