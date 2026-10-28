import { callAs, LOOPBACK_TIMEOUT_CODE, LOOPBACK_TIMEOUT_MS } from "../loopback";

const caller = { admin_id: "adm_1", email: "a@b.c", role: "owner", tenant_id: "ten_1", auth_identity_id: "ai_1" } as never;

const container = {
  resolve: () => ({ projectConfig: { http: { jwtSecret: "secret", jwtOptions: {} } } }),
} as never;

describe("agent changeset loopback (t-2026-10-28-80)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("gives up on a request that never answers after 30 s and names the path", async () => {
    // Node's own timeout timer is not under fake timers: the test hands the call
    // a signal it fires itself, and checks the call asked for 30 000 ms.
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    jest.spyOn(global, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    const outcome = callAs(container, caller, "ten_1", { method: "GET", path: "/tenants/home" }).then(
      () => null,
      (error: Error & { code?: string }) => error,
    );
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    const error = await outcome;
    expect(timeout).toHaveBeenCalledWith(LOOPBACK_TIMEOUT_MS);
    expect(LOOPBACK_TIMEOUT_MS).toBe(30_000);
    expect(error?.message).toContain("GET /tenants/home did not answer within 30 s");
    expect(error?.code).toBe(LOOPBACK_TIMEOUT_CODE);
  });
});
