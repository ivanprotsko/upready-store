import fs from "node:fs";
import path from "node:path";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import { STAFF_REFUSALS } from "../staff/staff-refusals";
import {
  assertAnotherOwnerStays,
  assertEmailHasNoIdentity,
  assertPasswordIsThisShopsOnly,
  isPlatformRow,
  type StaffRow,
} from "../staff/staff-rules";

/**
 * The rules of a shop's logins that both `/tenants/staff` and
 * `/admin/tenants/:id/admins` lean on (t-2026-10-07-11), without a database:
 * who counts as an owner of the shop, and when a password is not the shop's to
 * set. The same rules over HTTP are in
 * `integration-tests/http/tenants-staff-roles.spec.ts`.
 */

const PLATFORM = "app@staff-rules.test";

const row = (id: string, role: StaffRow["role"], email = `${id}@staff-rules.test`): StaffRow => ({
  id,
  email,
  role,
  tenant_id: "ten_a",
});

type Identity = { id: string; app_metadata?: Record<string, unknown> | null };

/** A container that answers the two modules the rules read, from plain lists. */
const containerWith = (identities: Record<string, Identity>, rows: StaffRow[]) =>
  ({
    resolve: (key: string) => {
      if (key === Modules.AUTH) {
        return {
          listAuthIdentities: async (filter: { provider_identities: { entity_id: string; provider: string } }) => {
            expect(filter.provider_identities.provider).toBe("emailpass");
            const identity = identities[filter.provider_identities.entity_id];
            return identity ? [identity] : [];
          },
        };
      }

      if (key === TENANT_MODULE) {
        return {
          listTenantAdmins: async (filter: { email: string }) => rows.filter((candidate) => candidate.email === filter.email),
        };
      }

      throw new Error(`The rules resolved something this test does not provide: ${key}`);
    },
  }) as unknown as MedusaContainer;

describe("the refusal texts (§13.1)", () => {
  const STAFF_DIR = path.resolve(__dirname, "../staff");
  const read = (...file: string[]) => fs.readFileSync(path.join(STAFF_DIR, ...file), "utf8");

  it("holds exactly the seven codes, each with a text of its own", () => {
    expect(Object.keys(STAFF_REFUSALS).sort()).toEqual(
      [
        "email_has_account",
        "email_taken_in_shop",
        "last_owner_demote",
        "last_owner_remove",
        "own_login",
        "own_role",
        "password_shared",
      ].sort(),
    );
    expect(new Set(Object.values(STAFF_REFUSALS)).size).toBe(7);
  });

  it("imports nothing, so the panel's test can read the file as it is", () => {
    expect(read("staff-refusals.ts")).not.toMatch(/^\s*import\s|require\(/m);
  });

  it("is the only place a refusal of the staff routes is worded", () => {
    // Every 400 the three files raise goes through `invalid(…)` or a
    // `MedusaError` with a text from the table: no string literal of their own.
    for (const file of [["staff-rules.ts"], ["route.ts"], ["[id]", "route.ts"]]) {
      const source = read(...file);
      const literals = [...source.matchAll(/(?:invalid\(|INVALID_DATA,)\s*(["'`])/g)];

      expect(`${file.join("/")}: ${literals.length}`).toBe(`${file.join("/")}: 0`);
      expect(source).toContain("STAFF_REFUSALS.");
    }
  });
});

describe("the platform's row", () => {
  const previous = process.env.PLATFORM_ADMIN_EMAIL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.PLATFORM_ADMIN_EMAIL;
    } else {
      process.env.PLATFORM_ADMIN_EMAIL = previous;
    }
  });

  it("is the row under PLATFORM_ADMIN_EMAIL, and no row at all when the variable is unset", () => {
    process.env.PLATFORM_ADMIN_EMAIL = PLATFORM;
    expect(isPlatformRow({ email: PLATFORM })).toBe(true);
    expect(isPlatformRow({ email: "owner@staff-rules.test" })).toBe(false);

    delete process.env.PLATFORM_ADMIN_EMAIL;
    expect(isPlatformRow({ email: PLATFORM })).toBe(false);
    expect(isPlatformRow({ email: null })).toBe(false);
  });
});

describe("a shop keeps one owner of its own", () => {
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAIL = PLATFORM;
  });

  afterEach(() => {
    delete process.env.PLATFORM_ADMIN_EMAIL;
  });

  const owner = row("owner", "owner");
  const secondOwner = row("second", "owner");
  const manager = row("manager", "manager");
  const operator = row("operator", "operator");
  const platform = row("platform", "owner", PLATFORM);

  it.each(["remove", "demote"] as const)("refuses to %s the only owner", (action) => {
    expect(() => assertAnotherOwnerStays([owner, manager, operator], owner, action)).toThrow(/last owner/);
  });

  it("does not count the platform's row as an owner of the shop", () => {
    expect(() => assertAnotherOwnerStays([owner, platform, manager], owner, "remove")).toThrow(/last owner/);
    expect(() => assertAnotherOwnerStays([owner, platform], owner, "demote")).toThrow(/last owner/);
  });

  it("lets one of two owners go", () => {
    expect(() => assertAnotherOwnerStays([owner, secondOwner, platform], owner, "remove")).not.toThrow();
    expect(() => assertAnotherOwnerStays([owner, secondOwner], secondOwner, "demote")).not.toThrow();
  });

  it("never stands in the way of a manager or an operator", () => {
    expect(() => assertAnotherOwnerStays([owner, manager], manager, "remove")).not.toThrow();
    expect(() => assertAnotherOwnerStays([owner, operator], operator, "demote")).not.toThrow();
    // Not even in a shop that, by some accident, has no owner at all.
    expect(() => assertAnotherOwnerStays([manager, operator], manager, "remove")).not.toThrow();
  });

  it("never stands in the way of the platform's own row", () => {
    expect(() => assertAnotherOwnerStays([owner, platform], platform, "remove")).not.toThrow();
    expect(() => assertAnotherOwnerStays([platform], platform, "demote")).not.toThrow();
  });

  it("says which of the two was refused, in the words of STAFF_REFUSALS", () => {
    expect(() => assertAnotherOwnerStays([owner], owner, "remove")).toThrow(STAFF_REFUSALS.last_owner_remove);
    expect(() => assertAnotherOwnerStays([owner], owner, "demote")).toThrow(STAFF_REFUSALS.last_owner_demote);
  });
});

describe("a new login needs an email nobody logs in with yet", () => {
  it("passes when no identity answers to the email", async () => {
    await expect(assertEmailHasNoIdentity(containerWith({}, []), "new@staff-rules.test")).resolves.toBeUndefined();
  });

  it.each([
    ["a login of another shop", { tenant_id: "tenadm_other" }],
    ["a platform user", { user_id: "user_1" }],
    ["a buyer", { customer_id: "cus_1" }],
    ["an identity registered in advance and attached to nothing", null],
  ])("refuses when the email is %s", async (_who, appMetadata) => {
    const container = containerWith({ "taken@staff-rules.test": { id: "authid_1", app_metadata: appMetadata } }, []);

    await expect(assertEmailHasNoIdentity(container, "taken@staff-rules.test")).rejects.toThrow(
      STAFF_REFUSALS.email_has_account,
    );
  });
});

describe("a password is the shop's to set only when the identity is the shop's alone", () => {
  const target = row("tenadm_target", "operator", "worker@staff-rules.test");

  it("passes for an identity that is this one row's and nothing else's", async () => {
    const container = containerWith(
      { [target.email]: { id: "authid_1", app_metadata: { tenant_id: target.id } } },
      [target],
    );

    await expect(assertPasswordIsThisShopsOnly(container, target)).resolves.toBeUndefined();
  });

  it("refuses when the same email holds a row in another shop", async () => {
    const elsewhere: StaffRow = { ...target, id: "tenadm_elsewhere", tenant_id: "ten_b" };
    const container = containerWith(
      { [target.email]: { id: "authid_1", app_metadata: { tenant_id: elsewhere.id } } },
      [target, elsewhere],
    );

    await expect(assertPasswordIsThisShopsOnly(container, target)).rejects.toThrow(STAFF_REFUSALS.password_shared);
  });

  it.each([
    ["a platform user", { tenant_id: "tenadm_target", user_id: "user_1" }],
    ["a buyer", { tenant_id: "tenadm_target", customer_id: "cus_1" }],
  ])("refuses when the identity is also %s", async (_who, appMetadata) => {
    const container = containerWith({ [target.email]: { id: "authid_1", app_metadata: appMetadata } }, [target]);

    await expect(assertPasswordIsThisShopsOnly(container, target)).rejects.toThrow(STAFF_REFUSALS.password_shared);
  });

  it("leaves a row with no identity at all to the workflow, which answers that it was not found", async () => {
    await expect(assertPasswordIsThisShopsOnly(containerWith({}, [target]), target)).resolves.toBeUndefined();
  });
});
