import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../modules/tenant";
import { ChangesetRefusal, discard, publish, type ChangesetRow } from "../lifecycle";
import type { Caller } from "../loopback";
import type { ChangesetOp } from "../ops";

const caller: Caller = { admin_id: "adm_1", email: "a@b.c", role: "owner", tenant_id: "ten_1", auth_identity_id: "ai_1" };

const ops: ChangesetOp[] = [
  { method: "PUT", path: "/tenants/pages/about", body: { title: "New about" } },
  { method: "PUT", path: "/tenants/pages/contacts", body: { title: "New contacts" } },
];

/** A container with one changeset row, a lock that runs one job per key at a time, and a live site in memory. */
const harness = (opsOfRow: ChangesetOp[], status: ChangesetRow["status"] = "staged") => {
  const row = {
    id: "acs_1",
    tenant_id: "ten_1",
    stage_tenant_id: "ten_stage",
    status,
    ops: opsOfRow,
    snapshot: null,
    published_hashes: null,
    result: null,
  } as unknown as ChangesetRow;
  const updates: Record<string, unknown>[] = [];
  const tails = new Map<string, Promise<unknown>>();
  const pages: Record<string, { title: string }> = {
    about: { title: "Old about" },
    contacts: { title: "Old contacts" },
  };
  const writes: { slug: string; title: string }[] = [];

  const tenant = {
    listAgentChangesets: async () => [{ ...row }],
    updateAgentChangesets: async (patch: Record<string, unknown>) => {
      updates.push(patch);
      Object.assign(row, patch);
      return { ...row };
    },
  };
  const locking = {
    execute: (key: string, job: () => Promise<unknown>) => {
      const run = (tails.get(key) ?? Promise.resolve()).then(job);
      tails.set(
        key,
        run.catch(() => undefined),
      );
      return run;
    },
  };
  const config = { projectConfig: { http: { jwtSecret: "secret", jwtOptions: {} } } };
  const container = {
    resolve: (name: string) =>
      name === TENANT_MODULE
        ? tenant
        : name === ContainerRegistrationKeys.CONFIG_MODULE
          ? config
          : name === "locking"
            ? locking
            : undefined,
  } as never;

  const json = (status: number, body: unknown) => ({ status, text: async () => JSON.stringify(body) }) as Response;
  const fetchMock = jest.spyOn(global, "fetch");
  const install = (failWrite?: (slug: string, nth: number) => unknown) => {
    const seen: Record<string, number> = {};
    fetchMock.mockImplementation((async (url: string, init?: RequestInit) => {
      const slug = String(url).split("/tenants/pages/")[1];
      if (init?.method === "PUT") {
        seen[slug] = (seen[slug] ?? 0) + 1;
        await new Promise((resolve) => setImmediate(resolve));
        const failure = failWrite?.(slug, seen[slug]);
        if (failure) throw failure;
        const { title } = JSON.parse(String(init.body));
        pages[slug] = { title };
        writes.push({ slug, title });
        return json(200, {});
      }
      return json(200, { page: pages[slug] ?? null });
    }) as never);
  };

  return { row, updates, writes, pages, container, install };
};

describe("agent changeset lifecycle (t-2026-10-28-80)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("runs the writes of a double publish once and refuses the second request with 409", async () => {
    const h = harness([ops[0]]);
    h.install();

    const first = publish(h.container, caller, h.row);
    const second = publish(h.container, caller, h.row);
    const outcomes = await Promise.allSettled([first, second]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(ChangesetRefusal);
    expect(refused.reason).toMatchObject({ status: 409 });
    expect(["wrong_status", "busy"]).toContain(refused.reason.code);
    expect(h.writes).toEqual([{ slug: "about", title: "New about" }]);
    expect(h.updates.filter((patch) => patch.status === "published")).toHaveLength(1);
  });

  it("refuses with 409 busy when the lock was never acquired", async () => {
    const h = harness([ops[0]]);
    h.install();
    const container = {
      resolve: (name: string) =>
        name === "locking"
          ? { execute: async () => Promise.reject(new Error("Timed-out acquiring lock.")) }
          : (h.container as { resolve: (n: string) => unknown }).resolve(name),
    } as never;

    await expect(discard(container, caller, h.row)).rejects.toMatchObject({ status: 409, code: "busy" });
  });

  it("undoes the written ops and answers 422 op_failed with op_timeout when a write times out", async () => {
    const h = harness(ops);
    h.install((slug, nth) =>
      slug === "contacts" && nth === 1
        ? new DOMException("The operation was aborted due to timeout", "TimeoutError")
        : null,
    );

    const outcome = await publish(h.container, caller, h.row).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(ChangesetRefusal);
    expect(outcome).toMatchObject({
      status: 422,
      code: "op_failed",
      details: { op_index: 1, op_timeout: true },
    });
    expect((outcome as Error).message).toContain("did not answer in time and may still have landed");
    // The first op was written, then put back to what it was.
    expect(h.writes).toEqual([
      { slug: "about", title: "New about" },
      { slug: "contacts", title: "Old contacts" },
      { slug: "about", title: "Old about" },
    ]);
    expect(h.pages.about.title).toBe("Old about");
    expect(h.updates.filter((patch) => patch.status === "published")).toHaveLength(0);
  });
});
