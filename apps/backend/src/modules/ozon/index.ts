import { Module } from "@medusajs/framework/utils";
import OzonModuleService from "./service";

/**
 * Ozon Seller API, read-only by construction (w11-ozon-readonly-client).
 *
 * The module owns the mirror tables (`ozon_product`, `ozon_price`,
 * `ozon_stock`, `ozon_posting`, `ozon_review`, `ozon_question`), the run log
 * (`ozon_sync_run`) and the transport journal (`ozon_api_call`). The client
 * itself lives next to them:
 *
 *   endpoints.ts    the allow-list of reads plus the deny-list of mutations,
 *                   both validated at load
 *   transport.ts    the only file in this repository that calls api-seller.ozon.ru
 *   credentials.ts  what the key says about itself, asked of Ozon's own /v1/roles
 *   fixtures.ts     recorded answers shaped from the saved reference, for a
 *                   stand with no key (Ozon documents no sandbox)
 *   sync.ts         the imports, all of them through `ozonRead`
 *
 * Nothing here writes to Ozon. See the head comment of `endpoints.ts`.
 *
 * Unlike the Wildberries module there is no boot-time key inspection loader:
 * WB's read-only bit is readable offline from the JWT, while Ozon's answer
 * lives behind a network call to `/v1/roles`, and a loader that calls a
 * marketplace on every boot is a boot that fails when the marketplace does.
 * `GET /tenants/ozon/status` and `ozon:sync` ask instead, at the moment
 * somebody is actually looking.
 */
export const OZON_MODULE = "ozon";

export default Module(OZON_MODULE, {
  service: OzonModuleService,
});
