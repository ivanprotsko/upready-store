import middlewares from "../middlewares";
import { injectCustomerTenantMetadata } from "../store/customers/inject-tenant-metadata";
import { injectTenantIntoPasswordResetMetadata } from "../auth/customer-reset-password-tenant";

/**
 * t-2026-10-02-shop-aware-account-emails: a middleware that is only defined
 * and never wired into a route is a no-op (`password-length-gate-wiring.unit.spec.ts`
 * is the sibling of this one). Both injectors must run on the ONE request that
 * ever learns which shop a buyer is in, and nowhere else.
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

  it("POST /auth/customer/emailpass/reset-password runs the reset-password tenant injector", () => {
    expect(middlewaresFor("/auth/customer/emailpass/reset-password", "POST")).toContain(
      injectTenantIntoPasswordResetMetadata,
    );
  });

  it.each(["/auth/customer/emailpass/register", "/auth/customer/emailpass/update", "/auth/customer/emailpass"])(
    "POST %s does not run the reset-password injector",
    (matcher) => {
      expect(middlewaresFor(matcher, "POST")).not.toContain(injectTenantIntoPasswordResetMetadata);
    },
  );
});
