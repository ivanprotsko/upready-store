import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace";
import type MarketplaceModuleService from "../../src/modules/marketplace/service";
import { WB_SYNC_KINDS } from "../../src/modules/wb/models/wb-sync-run";

jest.setTimeout(240_000);

/**
 * `POST /tenants/marketplaces/sync` — «Обновить сейчас» (t-2026-09-24-n6,
 * w6-mp-orders-sync-now).
 *
 * NO ADAPTER EVER RUNS HERE. A kind the route decides is DUE is handed to
 * `runOneSync` in the background (fire-and-forget), which would call the
 * real adapter — a real network request to Wildberries or Ozon — the instant
 * this process lets it. Every `mp_sync_run` row this suite seeds is therefore
 * deliberately NOT due: `running` (still fresh, for the 409) or
 * `rate_limited` with a `retry_at` in the future (for the per-kind skip), so
 * every response this suite asserts on is `outcome: "skipped"` and the
 * background half of the route never has anything to start. Ivan's standing
 * order stands: no write call, no read call, to any marketplace, ever, from a
 * test (t-2026-09-24-n6 prompt, "Real WB calls").
 *
 * What it proves, each with a request and not by reading code:
 *
 * - a `running` row younger than the stale-lock timeout refuses a second
 *   call for the SAME tenant with 409 `sync_in_progress`;
 * - that lock is scoped to its own tenant: tenant B's `running` row never
 *   blocks tenant A's call, and A's call never touches B's rows;
 * - a kind the marketplace itself rate-limited (`retry_at` in the future)
 *   comes back `skipped` / `waiting`, not silently dropped and not started
 *   early;
 * - a marketplace with no saved key comes back `skipped` / `no_key`, one
 *   entry for the whole marketplace, never one row per kind.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

const PASSWORD = "supersecret-owner";

/**
 * A WB-shaped token: three base64url parts whose payload carries `s` with bit
 * 30 set (read-only) and an `exp` a year out. `PUT /tenants/wb/key` only
 * DECODES this payload (`inspectToken`), never calls Wildberries with it, the
 * same fixture `tenants-marketplace-keys.spec.ts` uses.
 */
const wbToken = (tail: string): string => {
  const payload = {
    id: `sync-now-${tail}`,
    sid: "sync-now-seller",
    s: (1 << 30) | 1,
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    t: false,
    acc: 0,
  };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.sync-now-signature-${tail}`;
};

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: «Обновить сейчас» starts a sync without waiting for it", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email,
          password: PASSWORD,
        });
        expect(registration.status).toBe(200);
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);
        return { token: login.data.token, tenant: created.data.tenant };
      };

      const mp = () => getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

      /** A `mp_sync_run` row, deliberately never DUE (see the file's own doc comment). */
      const seedRun = async (
        tenantId: string,
        kind: string,
        status: "running" | "rate_limited",
        marketplace = "wb",
      ) => {
        const now = new Date();
        await mp().createMpSyncRuns({
          tenant_id: tenantId,
          marketplace,
          kind,
          status,
          started_at: now,
          finished_at: status === "rate_limited" ? now : null,
          retry_at: status === "rate_limited" ? new Date(now.getTime() + 10 * 60_000) : null,
          rows: 0,
          requests: 1,
          attempts: 1,
        });
      };

      beforeAll(async () => {
        a = await registerTenant("acme-sync", "Acme Sync");
        b = await registerTenant("globex-sync", "Globex Sync");
      });

      it("refuses a second call while one kind of this tenant is still running (409)", async () => {
        await seedRun(a.tenant.id, "cards", "running");

        const second = await failed(api.post("/tenants/marketplaces/sync", {}, bearer(a.token)));
        expect(second.status).toBe(409);
        expect(second.data.type).toBe("sync_in_progress");
        expect(second.data.message).toEqual(expect.any(String));
        expect(second.data.message.length).toBeGreaterThan(0);
      });

      it("does not let tenant B's running lock block tenant A, or A's call touch B's rows", async () => {
        const before = await mp().listMpSyncRuns({ tenant_id: b.tenant.id, marketplace: "wb" });
        await seedRun(b.tenant.id, "prices", "running");

        // A has no key of her own: every marketplace comes back `no_key`, so
        // nothing about this call can start a real sync.
        const asA = await api.post("/tenants/marketplaces/sync", {}, bearer(a.token));
        expect(asA.status).toBe(200);
        expect(asA.data.results.every((entry: { outcome: string }) => entry.outcome === "skipped")).toBe(
          true,
        );

        const afterB = await mp().listMpSyncRuns({ tenant_id: b.tenant.id, marketplace: "wb" });
        expect(afterB.length).toBe(before.length + 1);

        // B's own lock is still hers: a call as B still sees it and refuses.
        const asB = await failed(api.post("/tenants/marketplaces/sync", {}, bearer(b.token)));
        expect(asB.status).toBe(409);
      });

      it("reports a marketplace with no saved key as one skipped entry, not one per kind", async () => {
        const fresh = await registerTenant("hoopy-sync", "Hoopy Sync");
        const response = await api.post("/tenants/marketplaces/sync", {}, bearer(fresh.token));

        expect(response.status).toBe(200);
        // Neither marketplace has a key: one entry each, not one per kind.
        expect(response.data.results).toEqual([
          expect.objectContaining({ marketplace: "wb", kind: "*", outcome: "skipped", reason: "no_key" }),
          expect.objectContaining({
            marketplace: "ozon",
            kind: "*",
            outcome: "skipped",
            reason: "no_key",
          }),
        ]);
      });

      it("reports a rate-limited kind as skipped with its own reason, and starts nothing for that tenant", async () => {
        const fresh = await registerTenant("brontitall-sync", "Brontitall Sync");

        const saved = await api.put(
          "/tenants/wb/key",
          { api_key: wbToken("rate-limited") },
          bearer(fresh.token),
        );
        expect(saved.status).toBe(200);

        // Every WB kind is rate-limited, deliberately, so nothing this test
        // seeds is DUE: the route's response is built and returned before any
        // background sync would start, but nothing here is even ASKED to
        // start (see the file's own doc comment).
        for (const kind of [...WB_SYNC_KINDS, "projection"]) {
          await seedRun(fresh.tenant.id, kind, "rate_limited", "wb");
        }

        const response = await api.post("/tenants/marketplaces/sync", {}, bearer(fresh.token));
        expect(response.status).toBe(200);

        const wb = response.data.results.filter(
          (entry: { marketplace: string }) => entry.marketplace === "wb",
        );
        expect(wb).toHaveLength(WB_SYNC_KINDS.length + 1);
        expect(wb.every((entry: { outcome: string; reason: string }) => entry.outcome === "skipped" && entry.reason === "waiting")).toBe(
          true,
        );
        expect(wb.map((entry: { kind: string }) => entry.kind).sort()).toEqual(
          [...WB_SYNC_KINDS, "projection"].sort(),
        );

        // The ozon slot: no key, one skipped entry for the whole marketplace.
        const ozon = response.data.results.filter(
          (entry: { marketplace: string }) => entry.marketplace === "ozon",
        );
        expect(ozon).toEqual([
          expect.objectContaining({ kind: "*", outcome: "skipped", reason: "no_key" }),
        ]);

        // Nothing was started: no new `running` row appeared for this tenant.
        const running = await mp().listMpSyncRuns({ tenant_id: fresh.tenant.id, status: "running" });
        expect(running).toHaveLength(0);
      });

      it("takes no request without an owner token", async () => {
        const anonymous = await failed(api.post("/tenants/marketplaces/sync", {}));
        expect(anonymous.status).toBe(401);
      });
    });
  },
});
