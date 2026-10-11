import { PostTenantUpdatePasswordSchema } from "../validators";

/**
 * 46df A-22 (ASVS L2 §2.1.1): the owner's NEW password must be at least 8
 * characters (t-2026-10-11-23; 12 before), with a message zod (and so the route's own `INVALID_DATA`
 * error) can actually show. An already-stored, shorter password is never
 * touched by this schema — it only ever validates a `new_password` a caller
 * is trying to SET.
 */
describe("PostTenantUpdatePasswordSchema", () => {
  it("a 6-character new password is rejected with a clear message", () => {
    const result = PostTenantUpdatePasswordSchema.safeParse({
      current_password: "whatever-it-is",
      new_password: "123456",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) => entry.path[0] === "new_password");
      expect(issue?.message).toBe("New password must be at least 8 characters long.");
    }
  });

  it("a 7-character new password is still rejected (the boundary is inclusive at 8)", () => {
    const result = PostTenantUpdatePasswordSchema.safeParse({
      current_password: "whatever-it-is",
      new_password: "1234567",
    });

    expect(result.success).toBe(false);
  });

  it("an 8-character new password is accepted", () => {
    const result = PostTenantUpdatePasswordSchema.safeParse({
      current_password: "whatever-it-is",
      new_password: "12345678",
    });

    expect(result.success).toBe(true);
  });

  it("a longer new password is accepted", () => {
    const result = PostTenantUpdatePasswordSchema.safeParse({
      current_password: "whatever-it-is",
      new_password: "a-genuinely-long-passphrase",
    });

    expect(result.success).toBe(true);
  });
});
