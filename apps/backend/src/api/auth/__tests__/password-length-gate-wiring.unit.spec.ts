import middlewares from "../../middlewares";
import { requireOwnerPasswordLength } from "../password-length-gate";

/**
 * 46df A-22: the gate is only a control if Medusa runs it. The owner's first
 * password (`/register`) and the reset link (`/update`) must both pass through
 * it; the buyer's own registration must not.
 */
// `defineMiddlewares` normalises each route's `method` into `methods`.
const middlewaresFor = (matcher: string) =>
  (middlewares.routes ?? [])
    .filter((route) => {
      const methods = (route as { methods?: string[] }).methods ?? [];
      return route.matcher === matcher && methods.includes("POST");
    })
    .flatMap((route) => route.middlewares ?? []);

describe("requireOwnerPasswordLength wiring", () => {
  it.each([
    "/auth/tenant/emailpass/register",
    "/auth/tenant/emailpass/update",
    "/auth/user/emailpass/update",
  ])("POST %s runs the 12-character gate", (matcher) => {
    expect(middlewaresFor(matcher)).toContain(requireOwnerPasswordLength);
  });

  it("the buyer's POST /auth/customer/emailpass/register does not", () => {
    expect(middlewaresFor("/auth/customer/emailpass/register")).not.toContain(requireOwnerPasswordLength);
  });
});
