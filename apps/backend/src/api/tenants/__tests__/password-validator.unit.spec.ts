import { PostTenantUpdatePasswordSchema } from "../validators";

/**
 * 46df A-22 (ASVS L2 §2.1.1): the owner's NEW password must be at least 12
 * characters, with a message zod (and so the route's own `INVALID_DATA`
 * error) can actually show. An already-stored, shorter password is never
 * touched by this schema — it only ever validates a `new_password` a caller
 * is trying to SET.
 */
describe("PostTenantUpdatePasswordSchema", () => {
  it("a 10-character new password is rejected with a clear message", () => {
    const result = PostTenantUpdatePasswordSchema.safeParse({
      current_password: "whatever-it-is",
      new_password: "1234567890",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) => entry.path[0] === "new_password");
      expect(issue?.message).toBe("New password must be at least 12 characters long.");
    }
  });

  it("an 11-character new password is still rejected (the boundary is inclusive at 12)", () => {
    const result = PostTenantUpdatePasswordSchema.safeParse({
      current_password: "whatever-it-is",
      new_password: "12345678901",
    });

    expect(result.success).toBe(false);
  });

  it("a 12-character new password is accepted", () => {
    const result = PostTenantUpdatePasswordSchema.safeParse({
      current_password: "whatever-it-is",
      new_password: "123456789012",
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
