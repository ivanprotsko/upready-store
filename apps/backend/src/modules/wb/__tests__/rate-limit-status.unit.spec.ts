import { WB_SYNC_STATUSES } from "../models/wb-sync-run";
import { classifyRunFailure } from "../sync";
import { WbApiError } from "../transport";

/**
 * A WB rate limit is not a failure (w03-wb-sales-questions-mirror).
 *
 * On a base token the limits ARE the operating condition: sales get one
 * request every two hours, questions and feedbacks share five an hour. The
 * first version recorded every 429 as `status = "failed"`, and the owner's
 * panel then showed four red "с ошибкой" out of eight kinds — three of which
 * were merely waiting for a window, and one of which had written 1000 rows
 * before the limit arrived. That is a lie told by a status column, and it is
 * the kind that gets an integration declared broken.
 */
describe("a WB rate limit is recorded as waiting, not as a failure", () => {
  const limit = (retryAfterMs: number | null) =>
    new WbApiError("feedbacks.questions", 429, '{"status":429,"title":"Too Many Requests"}', retryAfterMs);

  it("offers a status for waiting at all", () => {
    expect(WB_SYNC_STATUSES).toContain("rate_limited");
  });

  it("classifies a 429 as waiting and carries WB's own window", () => {
    const before = Date.now();
    const verdict = classifyRunFailure(limit(720_000));

    expect(verdict.status).toBe("rate_limited");
    expect(verdict.retryAt).toBeInstanceOf(Date);
    const at = (verdict.retryAt as Date).getTime();
    expect(at).toBeGreaterThanOrEqual(before + 720_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 720_000);
  });

  it("still calls a 429 waiting when WB named no window", () => {
    const verdict = classifyRunFailure(limit(null));

    expect(verdict.status).toBe("rate_limited");
    expect(verdict.retryAt).toBeNull();
  });

  it("leaves a real WB error a failure", () => {
    const verdict = classifyRunFailure(
      new WbApiError("finance.sales-reports.detailed", 403, '{"detail":"scope is not allowed"}'),
    );

    expect(verdict.status).toBe("failed");
    expect(verdict.retryAt).toBeNull();
  });

  it("leaves our own bug a failure, and keeps its message", () => {
    const verdict = classifyRunFailure(
      new Error("Wb sale with tenant_id: ten_1, srid: er.rfa69, already exists."),
    );

    expect(verdict.status).toBe("failed");
    expect(verdict.retryAt).toBeNull();
    expect(verdict.message).toContain("already exists");
  });
});
