import {
  PostAdminTenantAdminCreateSchema,
  PostAdminTenantAdminUpdateSchema,
  PostAdminTenantCreateSchema,
} from "../validators";

/**
 * 46df A-22: the platform studio issues a shop admin's password through
 * three routes; each one now has the same 8-character floor (t-2026-10-11-23; 12 before) as the owner's
 * own change and reset, with a message the studio can show.
 */
const SEVEN = "1234567";
const EIGHT = "12345678";

const tenantBody = (password: string) => ({
  name: "Shop",
  handle: "shop-one",
  admin: { email: "owner@example.test", password },
});

const passwordIssue = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.find((issue) => issue.path[issue.path.length - 1] === "password");

describe("studio: shop admin password floor", () => {
  it("POST /admin/tenants: 7 characters refused with a clear message, 8 accepted", () => {
    const refused = PostAdminTenantCreateSchema.safeParse(tenantBody(SEVEN));
    expect(refused.success).toBe(false);
    expect(passwordIssue(refused)?.message).toBe("Password must be at least 8 characters long.");

    expect(PostAdminTenantCreateSchema.safeParse(tenantBody(EIGHT)).success).toBe(true);
  });

  it("POST /admin/tenants/:id/admins: 7 refused, 8 accepted", () => {
    const refused = PostAdminTenantAdminCreateSchema.safeParse({ email: "a@example.test", password: SEVEN });
    expect(refused.success).toBe(false);
    expect(passwordIssue(refused)?.message).toBe("Password must be at least 8 characters long.");

    expect(
      PostAdminTenantAdminCreateSchema.safeParse({ email: "a@example.test", password: EIGHT }).success,
    ).toBe(true);
  });

  it("POST /admin/tenants/:id/admins/:adminId: 7 refused, 8 accepted, omitted still allowed", () => {
    expect(PostAdminTenantAdminUpdateSchema.safeParse({ password: SEVEN }).success).toBe(false);
    expect(PostAdminTenantAdminUpdateSchema.safeParse({ password: EIGHT }).success).toBe(true);
    expect(PostAdminTenantAdminUpdateSchema.safeParse({ email: "a@example.test" }).success).toBe(true);
  });
});
