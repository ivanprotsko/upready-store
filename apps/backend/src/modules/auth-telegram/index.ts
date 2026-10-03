import { ModuleProvider, Modules } from "@medusajs/framework/utils";

import { TelegramAuthService } from "./services/telegram";

/**
 * Telegram provider for the Medusa auth module.
 *
 * Registered from `medusa-config.ts` as `./src/modules/auth-telegram` with id
 * "telegram", which is what exposes `/auth/customer/telegram`.
 *
 * Declaring the auth module in `medusa-config.ts` REPLACES Medusa's own default
 * registration (see the comment above `authModule` there), so `emailpass` has
 * to stay listed next to this one or every email-and-password login dies with it.
 */
export default ModuleProvider(Modules.AUTH, {
  services: [TelegramAuthService],
});
