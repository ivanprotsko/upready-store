import { Module } from "@medusajs/framework/utils";
import PlatformPricingModuleService from "./service";

export const PLATFORM_PRICING_MODULE = "platform_pricing";

export default Module(PLATFORM_PRICING_MODULE, {
  service: PlatformPricingModuleService,
});
