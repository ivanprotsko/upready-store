import { Module } from "@medusajs/framework/utils";
import WbModuleService from "./service";

/**
 * Wildberries Seller API, read-only by construction (w01-wb-readonly-client).
 *
 * The module owns the mirror tables (`wb_product`, `wb_price`, `wb_stock`,
 * `wb_order`, `wb_feedback`), the run log (`wb_sync_run`) and the transport
 * journal (`wb_api_call`). The client itself lives next to them:
 *
 *   endpoints.ts  the allowlist of reads, validated at load
 *   transport.ts  the only file in this repository that calls *.wildberries.ru
 *   token.ts      what the key says about itself, cited from WB's own docs
 *   sync.ts       the imports, all of them through `wbRead`
 *   secret.ts     the key, read from the shop's tenant secrets
 *
 * Nothing here writes to Wildberries. See the head comment of `endpoints.ts`.
 */
export const WB_MODULE = "wb";

export default Module(WB_MODULE, {
  service: WbModuleService,
});
