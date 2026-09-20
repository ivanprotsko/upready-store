import { MARKETPLACES, MUTATION_DENY_LIST } from "../registry";
import { ADAPTER_KEYS, type MarketplaceAdapter, type ReadEndpoint } from "../contract";
import {
  MarketplaceGuardError,
  deniedBy,
  validateAdapter,
  validateEndpointRegistry,
} from "../guards";

/**
 * THE CONFORMANCE SUITE (w12-marketplace-core, spec 2.5).
 *
 * It iterates over `MARKETPLACES` and runs the SAME set against every adapter.
 * That iteration is the point of the whole task: before it, the read-only
 * invariant was four rules written twice, once in `modules/wb` and once in
 * `modules/ozon`, and a third marketplace would have inherited none of them.
 * A new adapter now either passes this file or turns it red by the fact of
 * appearing in the registry (rule 20).
 *
 * The suite is shown to BITE rather than claimed to: the PR quotes a run with
 * a deliberately broken adapter pushed into the registry (RED) next to the run
 * after removing it (GREEN).
 *
 * `fetch` is spied on for the whole file. Every refusal below has to happen
 * BEFORE a socket opens, so "it threw" is only half the assertion; "and it
 * sent nothing" is the other half.
 */

const fetchSpy = jest.fn(() => {
  throw new Error(
    "A conformance test opened a socket. Every refusal in this file must happen before the " +
      "network is touched, so this is a failure of the adapter and not of the test.",
  );
});

beforeAll(() => {
  (globalThis as { fetch: unknown }).fetch = fetchSpy;
});

beforeEach(() => {
  fetchSpy.mockClear();
});

/** A registry entry that is valid apart from what a single test breaks. */
const goodEntry = (adapter: MarketplaceAdapter, over: Partial<ReadEndpoint> = {}): ReadEndpoint => ({
  id: "test.entry",
  host: `probe${adapter.hostSuffixes[0].startsWith(".") ? "" : "."}${adapter.hostSuffixes[0]}`,
  method: "GET",
  path: "/probe",
  docUrl: "https://example.invalid/doc",
  summary: "A hand-built entry, used only by the conformance suite.",
  ...over,
});

describe("every registered marketplace adapter", () => {
  it("registers at least the two this repository has", () => {
    // A registry that silently came back empty would pass every `it.each`
    // below while proving nothing at all (rule 20a: zero is not empty).
    expect(MARKETPLACES.length).toBeGreaterThanOrEqual(2);
    expect(MARKETPLACES.map((adapter) => adapter.id).sort()).toEqual(["ozon", "wb"]);
  });

  describe.each(MARKETPLACES.map((adapter) => [adapter.id, adapter] as const))(
    "%s",
    (_id, adapter) => {
      it("passes the shared validator over its real registry", () => {
        expect(() => validateAdapter(adapter)).not.toThrow();
      });

      it("registers no write verb", () => {
        for (const entry of adapter.endpoints) {
          expect(["GET", "POST"]).toContain(entry.method);
        }
      });

      it("registers no host outside its own suffixes", () => {
        for (const entry of adapter.endpoints) {
          expect(adapter.hostSuffixes.some((suffix) => entry.host.endsWith(suffix))).toBe(true);
        }
      });

      it("cites documentation on every entry, and a reason on every POST", () => {
        for (const entry of adapter.endpoints) {
          expect(entry.docUrl).toBeTruthy();
          if (entry.method === "POST") {
            expect(entry.readViaPost?.docUrl).toBeTruthy();
            expect(entry.readViaPost?.reason).toBeTruthy();
          }
        }
      });

      it("registers nothing its own deny-list calls a mutation", () => {
        for (const entry of adapter.endpoints) {
          expect(deniedBy(entry.method, entry.path, adapter.mutationDenyList)).toBeNull();
        }
      });

      it("refuses an unregistered endpoint id before opening a socket", async () => {
        await expect(
          adapter.read("this.id.is.not.registered", { credentials: "probe" }),
        ).rejects.toThrow();
        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it.each(["PUT", "PATCH", "DELETE"])(
        "has no way to express a %s, and trying opens no socket",
        async (verb) => {
          /**
           * There is no method parameter to pass, which is the actual
           * guarantee: the only thing a caller can name is an id. Naming an id
           * that LOOKS like a write is the closest a caller can come, and it
           * is refused like any other unregistered id.
           */
          await expect(
            adapter.read(`${verb} ${adapter.endpoints[0].path}`, { credentials: "probe" }),
          ).rejects.toThrow();
          expect(fetchSpy).not.toHaveBeenCalled();
        },
      );

      it("refuses a foreign host before opening a socket", async () => {
        await expect(
          adapter.read("https://evil.example.com/steal", { credentials: "probe" }),
        ).rejects.toThrow();
        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it("exposes no fetch, no base URL and no raw helper", () => {
        expect(Object.keys(adapter).sort()).toEqual([...ADAPTER_KEYS].sort());
        const surface = adapter as unknown as Record<string, unknown>;
        for (const escape of ["fetch", "baseUrl", "base_url", "raw", "request", "client", "write"]) {
          expect(surface[escape]).toBeUndefined();
        }
      });

      it("names every normalized kind with a pure function", () => {
        for (const kind of ["products", "offers", "orders", "reviews", "questions"] as const) {
          expect(typeof adapter.normalize[kind]).toBe("function");
          // A pure function of an empty input answers with an empty output and
          // touches nothing.
          expect(adapter.normalize[kind]([])).toEqual([]);
          expect(fetchSpy).not.toHaveBeenCalled();
        }
      });

      it("declares its sync kinds and its deny-list", () => {
        expect(adapter.syncKinds.length).toBeGreaterThan(0);
        expect(adapter.mutationDenyList.length).toBeGreaterThan(0);
        expect(MUTATION_DENY_LIST[adapter.id]).toBe(adapter.mutationDenyList);
      });

      /* ---- the validator, fed entries that MUST be refused ---- */

      it.each([
        ["a write verb", { method: "DELETE" as unknown as "GET" }],
        ["a foreign host", { host: "evil.example.com" }],
        ["no documentation", { docUrl: "" }],
        ["a relative path", { path: "probe" }],
        ["a POST without readViaPost", { method: "POST" as const }],
        [
          "a POST without a quoted reason",
          {
            method: "POST" as const,
            readViaPost: { docUrl: "https://example.invalid/doc", reason: "" },
          },
        ],
        [
          "a GET carrying readViaPost",
          { readViaPost: { docUrl: "https://example.invalid/doc", reason: "why" } },
        ],
      ])("rejects a hand-built entry with %s", (_what, over) => {
        expect(() =>
          validateEndpointRegistry(adapter, [goodEntry(adapter, over as Partial<ReadEndpoint>)]),
        ).toThrow(MarketplaceGuardError);
      });

      it("rejects two entries with the same id", () => {
        expect(() =>
          validateEndpointRegistry(adapter, [goodEntry(adapter), goodEntry(adapter)]),
        ).toThrow(/Duplicate endpoint id/);
      });

      it("rejects an entry whose path the documentation calls a mutation", () => {
        /**
         * A deny-list entry whose verb a registry entry could actually carry.
         * A `DELETE` mutation is already unreachable one check earlier — the
         * verb itself is unregistrable — so it would prove the wrong thing
         * here; the interesting case is the mutation hiding inside a POST,
         * which is how both marketplaces write.
         */
        const mutation = adapter.mutationDenyList.find(
          (entry) => entry.method === "*" || entry.method === "POST",
        );

        expect(mutation).toBeDefined();

        expect(() =>
          validateEndpointRegistry(adapter, [
            goodEntry(adapter, {
              method: "POST",
              path: (mutation as { path: string }).path.replace(/\{([A-Za-z0-9_]+)\}/g, ":$1"),
              readViaPost: {
                docUrl: "https://example.invalid/doc",
                reason: "The suite's own entry, refused for its path.",
              },
            }),
          ]),
        ).toThrow(/the documentation calls a mutation/);
      });

      it("accepts a well-formed hand-built entry, so the rejections above mean something", () => {
        // Without this, every `toThrow` above would also pass on a validator
        // that refuses everything.
        expect(() => validateEndpointRegistry(adapter, [goodEntry(adapter)])).not.toThrow();
      });
    },
  );

  it("refuses an adapter that grows an escape hatch", () => {
    const withHatch = {
      ...MARKETPLACES[0],
      rawRequest: async () => ({ status: 200 }),
    } as unknown as MarketplaceAdapter;

    expect(() => validateAdapter(withHatch)).toThrow(/members the contract does not define/);
  });

  it("refuses an adapter with an empty deny-list", () => {
    const withoutDenyList = {
      ...MARKETPLACES[0],
      mutationDenyList: [],
    } as unknown as MarketplaceAdapter;

    expect(() => validateAdapter(withoutDenyList)).toThrow(/empty mutationDenyList/);
  });

  it("compares deny-list paths by placeholder POSITION, not by placeholder name", () => {
    // `/api/v3/stocks/{warehouseId}` in the docs is `/api/v3/stocks/:warehouseId`
    // in a registry entry, and renaming that parameter must not open a hole.
    const denyList = [
      {
        method: "PUT" as const,
        path: "/api/v3/stocks/{warehouseId}",
        summary: "Update Inventory",
        docUrl: "https://example.invalid/doc",
      },
    ];

    expect(deniedBy("PUT", "/api/v3/stocks/:warehouseId", denyList)).not.toBeNull();
    expect(deniedBy("PUT", "/api/v3/stocks/:anythingElse", denyList)).not.toBeNull();
    expect(deniedBy("POST", "/api/v3/stocks/:warehouseId", denyList)).toBeNull();
    expect(deniedBy("PUT", "/api/v3/stocks", denyList)).toBeNull();
  });
});
