import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import TariffFulfillmentService from "./service";

/** Provider id in the database: `tariff_tariff` (config id `tariff` + identifier `tariff`). */
export const TARIFF_PROVIDER_ID = "tariff_tariff";

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [TariffFulfillmentService],
});
