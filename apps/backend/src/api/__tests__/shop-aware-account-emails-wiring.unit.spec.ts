import middlewares from "../middlewares";
import { injectCustomerTenantMetadata } from "../store/customers/inject-tenant-metadata";
import { stripCustomerTenantMetadata } from "../store/customers/strip-tenant-metadata";

/**
 * t-2026-10-02-shop-aware-account-emails: a middleware that is only defined
 * and never wired into a route is a no-op (`password-length-gate-wiring.unit.spec.ts`
 * is the sibling of this one).
 *
 * The reset-password request itself carries NO tenant injector any more — the
 * lead's security review found that trusting the request's own publishable
 * key let one shop request a reset for another shop's customer and have the
 * link (and its token) open on the requester's own domain
 * (`password-reset-email.ts` now reads the shop off the customer's own stored
 * row instead). `injectCustomerTenantMetadata` still writes that row at
 * registration time, and `stripCustomerTenantMetadata` is the other half: the
 * buyer's own "update my profile" call must not be able to rewrite it.
 */
const middlewaresFor = (matcher: string, method: string) =>
  (middlewares.routes ?? [])
    .filter((route) => {
      const methods = (route as { methods?: string[] }).methods ?? [];
      return route.matcher === matcher && methods.includes(method);
    })
    .flatMap((route) => route.middlewares ?? []);

describe("shop-aware account emails wiring", () => {
  it("POST /store/customers runs the tenant-metadata injector", () => {
    expect(middlewaresFor("/store/customers", "POST")).toContain(injectCustomerTenantMetadata);
  });

  it("POST /store/customers/me runs the tenant-metadata stripper", () => {
    expect(middlewaresFor("/store/customers/me", "POST")).toContain(stripCustomerTenantMetadata);
  });

  it.each(["/auth/customer/emailpass/reset-password", "/auth/customer/emailpass/register", "/auth/customer/emailpass/update", "/auth/customer/emailpass"])(
    "POST %s carries no tenant injector of its own",
    (matcher) => {
      expect(middlewaresFor(matcher, "POST")).not.toContain(injectCustomerTenantMetadata);
      expect(middlewaresFor(matcher, "POST")).not.toContain(stripCustomerTenantMetadata);
    },
  );
});
