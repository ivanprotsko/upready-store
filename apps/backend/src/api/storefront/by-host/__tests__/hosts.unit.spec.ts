import {
  baseDomainOfHost,
  isTenantIdLabel,
  primaryHostFor,
  tenantIdHostFor,
  tenantIdsFromLabel,
} from "../hosts";

const withBases = <T>(bases: string, run: () => T): T => {
  const previous = process.env.TENANT_BASE_DOMAINS;
  process.env.TENANT_BASE_DOMAINS = bases;

  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.TENANT_BASE_DOMAINS;
    } else {
      process.env.TENANT_BASE_DOMAINS = previous;
    }
  }
};

describe("baseDomainOfHost", () => {
  it("names the zone a technical host lives in", () => {
    withBases("shipshift.dev,localhost", () => {
      expect(baseDomainOfHost("acme.shipshift.dev")).toBe("shipshift.dev");
      expect(baseDomainOfHost("acme.localhost")).toBe("localhost");
    });
  });

  it("is null for a host that is not <label>.<base>", () => {
    withBases("shipshift.dev", () => {
      expect(baseDomainOfHost("vasya.com")).toBeNull();
      expect(baseDomainOfHost("shop.acme.shipshift.dev")).toBeNull();
    });
  });
});

describe("primaryHostFor", () => {
  it("is the custom domain the owner marked primary", () => {
    withBases("shipshift.dev", () =>
      expect(
        primaryHostFor({ handle: "acme", primaryDomain: "vasya.com" }),
      ).toBe("vasya.com"),
    );
  });

  it("is the platform subdomain when no custom domain is primary", () => {
    withBases("shipshift.dev", () =>
      expect(primaryHostFor({ handle: "acme" })).toBe("acme.shipshift.dev"),
    );
  });

  it("keeps a stand canonical on its own zone rather than the first configured one", () => {
    withBases("upready.dev,localhost", () =>
      expect(
        primaryHostFor({ handle: "acme", requestHost: "oldacme.localhost" }),
      ).toBe("acme.localhost"),
    );
  });

  it("names the shop's current address for a request on the handle it used before", () => {
    withBases("shipshift.dev", () =>
      expect(
        primaryHostFor({ handle: "acme-store", requestHost: "acme.shipshift.dev" }),
      ).toBe("acme-store.shipshift.dev"),
    );
  });
});

describe("the technical id address", () => {
  it("recognises a lowercased tenant id as a host label", () => {
    expect(isTenantIdLabel("ten_01m28gbev6sbgbwkfchthren9n")).toBe(true);
    expect(isTenantIdLabel("acme")).toBe(false);
    expect(isTenantIdLabel("tenant_01m28")).toBe(false);
  });

  it("tries the id as Medusa mints it, and as written", () => {
    expect(tenantIdsFromLabel("ten_01m28gbev6sbgbwkfchthren9n")).toEqual([
      "ten_01M28GBEV6SBGBWKFCHTHREN9N",
      "ten_01m28gbev6sbgbwkfchthren9n",
    ]);
  });

  it("writes the address a shop keeps whatever its handle becomes", () => {
    expect(
      tenantIdHostFor("ten_01M28GBEV6SBGBWKFCHTHREN9N", "shipshift.dev"),
    ).toBe("ten_01m28gbev6sbgbwkfchthren9n.shipshift.dev");
  });
});
