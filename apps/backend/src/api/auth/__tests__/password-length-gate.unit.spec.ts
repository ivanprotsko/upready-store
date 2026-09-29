import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { OWNER_PASSWORD_TOO_SHORT_MESSAGE, requireOwnerPasswordLength } from "../password-length-gate";

/**
 * 46df A-22: `POST /auth/tenant/emailpass/update` (the owner's reset link) and
 * `POST /auth/user/emailpass/update` refuse a new password under 12
 * characters on the server, before Medusa's own handler stores it.
 */
const run = (body: Record<string, unknown> | undefined) => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const next = jest.fn() as unknown as MedusaNextFunction;

  requireOwnerPasswordLength(
    { body } as unknown as MedusaRequest<{ password?: unknown }>,
    { status } as unknown as MedusaResponse,
    next,
  );

  return { status, json, next };
};

describe("requireOwnerPasswordLength", () => {
  it("an 11-character password is refused with 400 and a clear message; the core handler never runs", () => {
    const { status, json, next } = run({ password: "12345678901" });

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ type: "invalid_data", message: OWNER_PASSWORD_TOO_SHORT_MESSAGE });
    expect(OWNER_PASSWORD_TOO_SHORT_MESSAGE).toBe("Password must be at least 12 characters long.");
    expect(next).not.toHaveBeenCalled();
  });

  it("a 12-character password is passed on to the core handler", () => {
    const { status, next } = run({ password: "123456789012" });

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it("a missing or non-string password is refused the same way", () => {
    for (const body of [undefined, {}, { password: 123456789012 }]) {
      const { status, next } = run(body);
      expect(status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    }
  });
});
