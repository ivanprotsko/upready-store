import WbModuleService from "../service";
import { MIRROR_PLURAL, type MirrorEntity } from "../sync";

/**
 * The mirror writers call the module service by name
 * (w03-wb-sales-questions-mirror).
 *
 * `MedusaService` builds `listX`, `createX` and `updateX` from the PLURAL of
 * each model name, and English plurals are not built by appending an "s":
 * `WbAnalyticsDaily` becomes `WbAnalyticsDailies`. A wrong name is not a type
 * error, because the call goes through an index signature, and it does not
 * fail at boot either: it fails at the first row of a live import, halfway
 * through a rate-limited window (rule 20a — the failure has to be visible
 * early, and here "early" means in the suite).
 */
describe("the mirror plurals name methods that exist", () => {
  const entities = Object.keys(MIRROR_PLURAL) as MirrorEntity[];

  it("knows every mirror the sync writes to", () => {
    expect(entities.sort()).toEqual(
      [
        "WbAnalyticsDaily",
        "WbFeedback",
        "WbOrder",
        "WbPrice",
        "WbProduct",
        "WbQuestion",
        "WbSale",
        "WbStock",
      ].sort(),
    );
  });

  it.each(entities)("%s has list, create and update on the service", (entity) => {
    const plural = MIRROR_PLURAL[entity];
    const prototype = WbModuleService.prototype as unknown as Record<string, unknown>;

    for (const verb of ["list", "create", "update"]) {
      expect(typeof prototype[`${verb}${plural}`]).toBe("function");
    }
  });
});
