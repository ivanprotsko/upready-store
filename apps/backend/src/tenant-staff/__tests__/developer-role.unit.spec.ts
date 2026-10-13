import {
  describeDeveloperRolePlan,
  parseEmailList,
  planDeveloperRoles,
  type StaffLogin,
} from "../developer-role";

/**
 * The plan of `src/scripts/assign-developer-role.ts` (t-2026-10-14-41), on the
 * shape the read-only inventory of 14.10.2026 found on the INTL database: a
 * real shop with the developer's login, an agent's service login, the
 * business's owner and the platform's row, all four of them owners. Every
 * address here is invented.
 */

const PLATFORM = "app@platform.test";
const DEVELOPER = "dev+shop@developer.test";
const SERVICE = "dev+shop-ops@developer.test";
const BUSINESS = "owner@business.test";

const login = (id: string, tenant: string, email: string, role: StaffLogin["role"] = "owner"): StaffLogin => ({
  id,
  email,
  role,
  tenant_id: `ten_${tenant}`,
  tenant_handle: tenant,
});

const SHOPS: StaffLogin[] = [
  login("a_dev", "shop", DEVELOPER),
  login("a_ops", "shop", SERVICE),
  login("a_platform", "shop", PLATFORM),
  login("a_owner", "shop", BUSINESS),
  login("a_manager", "shop", "manager@business.test", "manager"),
  // A sister site where the developer is the only owner of the shop.
  login("s_platform", "sister", PLATFORM),
  login("s_dev", "sister", DEVELOPER),
  // A test shop: its owner is no one's to change.
  login("t_platform", "test-shop", PLATFORM),
  login("t_owner", "test-shop", "agent@test-shop.test"),
];

const INPUT = { platformEmail: PLATFORM, developers: [DEVELOPER], services: [SERVICE] };

const moves = (rows: StaffLogin[], input = INPUT) =>
  planDeveloperRoles(rows, input).changes.map((change) => `${change.id} ${change.from}->${change.to} ${change.reason}`);

describe("who stops being an owner", () => {
  it("makes the platform's row and the developer developers, and the service login an operator", () => {
    expect(moves(SHOPS)).toEqual([
      "a_dev owner->developer developer",
      "a_ops owner->operator service account",
      "a_platform owner->developer platform row",
      "s_platform owner->developer platform row",
      "s_dev owner->developer developer",
      "t_platform owner->developer platform row",
    ]);
  });

  it("leaves the business's owner, the manager and a test shop's owner as they are", () => {
    const changed = planDeveloperRoles(SHOPS, INPUT).changes.map((change) => change.id);
    expect(changed).not.toContain("a_owner");
    expect(changed).not.toContain("a_manager");
    expect(changed).not.toContain("t_owner");
  });

  it("plans nothing on a second run", () => {
    const plan = planDeveloperRoles(SHOPS, INPUT);
    const after = SHOPS.map((row) => {
      const change = plan.changes.find((candidate) => candidate.id === row.id);
      return change ? { ...row, role: change.to } : row;
    });
    expect(planDeveloperRoles(after, INPUT).changes).toEqual([]);
  });

  it("only touches owners: a developer address with another role keeps it", () => {
    expect(moves([login("m", "shop", DEVELOPER, "manager"), login("o", "shop", SERVICE, "operator")])).toEqual([]);
  });

  it("matches addresses without regard to case or spaces", () => {
    expect(
      moves([login("x", "shop", "Dev+Shop@Developer.test")], {
        platformEmail: ` ${PLATFORM.toUpperCase()} `,
        developers: [" DEV+SHOP@developer.test"],
        services: [],
      }),
    ).toEqual(["x owner->developer developer"]);
  });

  it("changes only the platform's row when no address is named", () => {
    expect(moves(SHOPS, { platformEmail: PLATFORM, developers: [], services: [] })).toEqual([
      "a_platform owner->developer platform row",
      "s_platform owner->developer platform row",
      "t_platform owner->developer platform row",
    ]);
    expect(moves(SHOPS, { platformEmail: null, developers: [], services: [] })).toEqual([]);
  });

  it("refuses an address named as a service account and as a developer or the platform", () => {
    expect(() => planDeveloperRoles(SHOPS, { platformEmail: PLATFORM, developers: [DEVELOPER], services: [DEVELOPER] })).toThrow(
      DEVELOPER,
    );
    expect(() => planDeveloperRoles(SHOPS, { platformEmail: PLATFORM, developers: [], services: [PLATFORM] })).toThrow(
      PLATFORM,
    );
  });
});

describe("a shop left without an owner of its own", () => {
  it("is named, and only a shop the plan touches", () => {
    expect(planDeveloperRoles(SHOPS, INPUT).shopsWithoutOwner).toEqual(["sister"]);
  });

  it("is said in the summary line", () => {
    const lines = describeDeveloperRolePlan(planDeveloperRoles(SHOPS, INPUT), false);
    expect(lines[lines.length - 1]).toBe("6 login(s) to change; no owner of its own left in: sister");
    expect(lines[0]).toBe(`shop: ${DEVELOPER} owner -> developer (developer) [dry run]`);
  });
});

describe("the address lists of the environment", () => {
  it("reads commas, spaces and nothing at all", () => {
    expect(parseEmailList("a@x.test, B@x.test  c@x.test,,")).toEqual(["a@x.test", "b@x.test", "c@x.test"]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
  });
});
