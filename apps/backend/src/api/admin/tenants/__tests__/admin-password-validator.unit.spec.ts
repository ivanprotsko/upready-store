import {
  PostAdminTenantAdminCreateSchema,
  PostAdminTenantAdminUpdateSchema,
  PostAdminTenantCreateSchema,
} from "../validators";

/**
 * 46df A-22: the platform studio issues a shop admin's password through
 * three routes; each one now has the same 12-character floor as the owner's
 * own change and reset, with a message the studio can show.
 */
const ELEVEN = "12345678901";
const TWELVE = "123456789012";

const tenantBody = (password: string) => ({
  name: "Shop",
  handle: "shop-one",
  admin: { email: "owner@example.test", password },
});

const passwordIssue = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.find((issue) => issue.path[issue.path.length - 1] === "password");

describe("studio: shop admin password floor", () => {
  it("POST /admin/tenants: 11 characters refused with a clear message, 12 accepted", () => {
    const refused = PostAdminTenantCreateSchema.safeParse(tenantBody(ELEVEN));
    expect(refused.success).toBe(false);
    expect(passwordIssue(refused)?.message).toBe("Password must be at least 12 characters long.");

    expect(PostAdminTenantCreateSchema.safeParse(tenantBody(TWELVE)).success).toBe(true);
  });

  it("POST /admin/tenants/:id/admins: 11 refused, 12 accepted", () => {
    const refused = PostAdminTenantAdminCreateSchema.safeParse({ email: "a@example.test", password: ELEVEN });
    expect(refused.success).toBe(false);
    expect(passwordIssue(refused)?.message).toBe("Password must be at least 12 characters long.");

    expect(
      PostAdminTenantAdminCreateSchema.safeParse({ email: "a@example.test", password: TWELVE }).success,
    ).toBe(true);
  });

  it("POST /admin/tenants/:id/admins/:adminId: 11 refused, 12 accepted, omitted still allowed", () => {
    expect(PostAdminTenantAdminUpdateSchema.safeParse({ password: ELEVEN }).success).toBe(false);
    expect(PostAdminTenantAdminUpdateSchema.safeParse({ password: TWELVE }).success).toBe(true);
    expect(PostAdminTenantAdminUpdateSchema.safeParse({ email: "a@example.test" }).success).toBe(true);
  });
});
