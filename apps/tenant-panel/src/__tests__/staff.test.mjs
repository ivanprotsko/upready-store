import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { OWNER_NAV } from "../components/layout/owner-nav/nav-model.ts"
import { PERMISSIONS, permissionOfPath } from "../lib/permissions.ts"
import {
  STAFF_PASSWORD_MIN,
  createStaffBody,
  draftOfStaff,
  emptyStaffDraft,
  leastRole,
  roleSees,
  staffErrorText,
  staffName,
  staffRoleOf,
  staffRoleOptions,
  staffRowActions,
  updateStaffBody,
} from "../lib/staff.ts"

/**
 * «Сотрудники» (t-2026-10-07-11): the owner creates the logins of her staff
 * herself and gives each a role. `lib/staff.ts` holds what a form sends and
 * what it refuses, and is run for real; the screen is checked by its source,
 * the way the rest of this folder does it. Every address, name and password
 * below is made up for the test.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(here, "..", path), "utf8")

const PASSWORD = "made-up-for-the-test-1"

/**
 * What `GET /tenants/staff` lists next to the logins by the brief's contract
 * (3.2 and the lead's answer 12.3): every role with what it opens. It lives in
 * this test; the panel has no such table.
 */
const ROLES = [
  { role: "owner", permissions: [...PERMISSIONS] },
  {
    role: "manager",
    permissions: ["orders", "customers", "reviews", "catalog", "storefront", "marketing", "marketplaces"],
  },
  { role: "operator", permissions: ["orders", "customers"] },
]
const member = (patch = {}) => ({
  id: "ta_2",
  email: "packer@shop.test",
  first_name: "Vera",
  last_name: "Lugovaya",
  role: "operator",
  created_at: "2026-10-01T02:00:00.000Z",
  updated_at: "2026-10-01T02:00:00.000Z",
  is_self: false,
  ...patch,
})

// ---------------------------------------------------------------- adding a login

test("a new login is sent as the contract names it: email, password, role, the names when given", () => {
  const draft = {
    ...emptyStaffDraft(),
    email: "  packer@shop.test ",
    firstName: " Vera ",
    lastName: "",
    role: "manager",
    password: PASSWORD,
  }
  assert.deepEqual(createStaffBody(draft), {
    body: { email: "packer@shop.test", password: PASSWORD, role: "manager", first_name: "Vera" },
  })
})

test("the form offers the server's roles in the server's order", () => {
  assert.deepEqual(staffRoleOptions(ROLES), ["owner", "manager", "operator"])
  assert.deepEqual(
    staffRoleOptions([...ROLES, { role: "auditor", permissions: ["orders"] }]),
    ["owner", "manager", "operator", "auditor"],
    "a role the server adds is offered without a change in the panel"
  )
  // A server that listed none still gets a form with the three names.
  assert.deepEqual(staffRoleOptions(undefined), ["owner", "manager", "operator"])
  assert.deepEqual(staffRoleOptions([]), ["owner", "manager", "operator"])
})

test("the line under the role is built from what the server says the role opens", () => {
  assert.deepEqual(roleSees(ROLES, "operator"), ["orders", "customers"])
  assert.deepEqual(roleSees(ROLES, "manager"), [
    "orders",
    "customers",
    "reviews",
    "catalog",
    "storefront",
    "marketing",
    "marketplaces",
  ])
  assert.deepEqual(roleSees(ROLES, "owner"), [...PERMISSIONS])
  // The server's table is the only one: change it and the line follows.
  const changed = [{ role: "operator", permissions: ["reviews", "orders", "billing"] }]
  assert.deepEqual(roleSees(changed, "operator"), ["orders", "reviews"])
  // No list from the server, or a role it did not list: no line rather than a guess.
  assert.deepEqual(roleSees(undefined, "manager"), [])
  assert.deepEqual(roleSees(ROLES, "auditor"), [])
})

test("the form opens on the role that sees least", () => {
  assert.equal(leastRole(ROLES), "operator")
  assert.equal(emptyStaffDraft(ROLES).role, "operator")
  assert.equal(
    leastRole([
      { role: "owner", permissions: [...PERMISSIONS] },
      { role: "cashier", permissions: ["orders"] },
      { role: "operator", permissions: ["orders", "customers"] },
    ]),
    "cashier"
  )
  assert.equal(emptyStaffDraft().role, "operator")
})

test("a new login needs an email and a password of twelve characters", () => {
  assert.equal(STAFF_PASSWORD_MIN, 12)
  assert.deepEqual(createStaffBody({ ...emptyStaffDraft(), password: PASSWORD }), { error: "emailRequired" })
  assert.deepEqual(
    createStaffBody({ ...emptyStaffDraft(), email: "packer@shop.test", password: "elevenchars" }),
    { error: "passwordTooShort" }
  )
})

// ---------------------------------------------------------------- editing a login

test("an edit sends only what changed", () => {
  const row = member()
  assert.deepEqual(updateStaffBody(row, { ...draftOfStaff(row), role: "manager" }), {
    body: { role: "manager" },
  })
  assert.deepEqual(updateStaffBody(row, { ...draftOfStaff(row), firstName: "Vera ", lastName: "Sokolova" }), {
    body: { last_name: "Sokolova" },
  })
  assert.deepEqual(updateStaffBody(row, { ...draftOfStaff(row), firstName: "" }), {
    body: { first_name: "" },
  })
})

test("an empty password field keeps the password, a short one is refused before the request", () => {
  const row = member()
  assert.deepEqual(updateStaffBody(row, draftOfStaff(row)), { error: "nothingChanged" })
  assert.deepEqual(updateStaffBody(row, { ...draftOfStaff(row), password: "short" }), {
    error: "passwordTooShort",
  })
  assert.deepEqual(updateStaffBody(row, { ...draftOfStaff(row), password: PASSWORD }), {
    body: { password: PASSWORD },
  })
})

test("a login never sends a change of its own role and is not offered to delete itself", () => {
  const self = member({ is_self: true, role: "owner" })
  assert.deepEqual(staffRowActions(self), { canDelete: false, canChangeRole: false })
  assert.deepEqual(staffRowActions(member()), { canDelete: true, canChangeRole: true })
  assert.deepEqual(updateStaffBody(self, { ...draftOfStaff(self), role: "operator", lastName: "Sokolova" }), {
    body: { last_name: "Sokolova" },
  })
  assert.deepEqual(updateStaffBody(self, { ...draftOfStaff(self), role: "operator" }), {
    error: "nothingChanged",
  })
})

// ---------------------------------------------------------------- what the table shows

test("a row shows the name, and a role the panel has no name for as the server spelled it", () => {
  assert.equal(staffName(member()), "Vera Lugovaya")
  assert.equal(staffName(member({ first_name: null, last_name: null })), "")
  assert.equal(staffRoleOf(member()), "operator")
  assert.equal(staffRoleOf(member({ role: "auditor" })), null)
  assert.equal(draftOfStaff(member({ first_name: null })).firstName, "")
  assert.equal(draftOfStaff(member({ role: "auditor" })).role, "auditor", "an edit keeps a role as it is")
})

test("a refusal of the server is shown in the server's words", () => {
  const general = "general text"
  for (const message of [
    "The last owner of the shop cannot be deleted",
    "This email already has a login in this shop",
    "This email belongs to an account of another shop; its password cannot be set here",
  ]) {
    assert.equal(staffErrorText(Object.assign(new Error(message), { status: 400 }), general), message)
  }
  assert.equal(staffErrorText({ message: "  " }, general), general)
  assert.equal(staffErrorText(undefined, general), general)
  assert.equal(staffErrorText("boom", general), general)
})

// ---------------------------------------------------------------- the screen

test("«Сотрудники» is a screen of the settings group and needs the staff permission", () => {
  const settings = OWNER_NAV.find((group) => group.id === "settings")
  const entry = settings.items.find((item) => item.to === "/settings/staff")
  assert.ok(entry, "the settings group has no «Сотрудники»")
  assert.equal(entry.labelKey, "app.nav.owner.staff")
  assert.equal(permissionOfPath("/settings/staff"), "staff")

  const app = read("app.tsx")
  assert.match(app, /path: "\/settings\/staff",[\s\S]{0,200}lazy: \(\) => import\("\.\/routes\/settings\/staff"\)/)
  assert.match(read("routes/settings/staff/index.ts"), /export \{ Staff as Component \}/)
})

test("the hooks call the four routes of the contract", () => {
  const hooks = read("hooks/api/staff.tsx")
  assert.match(hooks, /fetch<StaffListResponse>\("\/tenants\/staff"\)/)
  assert.match(hooks, /fetch<StaffMemberResponse>\("\/tenants\/staff", \{\s*method: "POST"/)
  assert.match(hooks, /fetch<StaffMemberResponse>\(`\/tenants\/staff\/\$\{id\}`, \{\s*method: "POST"/)
  assert.match(hooks, /fetch<StaffDeleteResponse>\(`\/tenants\/staff\/\$\{id\}`, \{\s*method: "DELETE"/)
  // Every change refreshes the list.
  assert.equal(hooks.match(/invalidateQueries\(\{ queryKey: staffQueryKeys\.lists\(\) \}\)/g)?.length, 3)
})

test("the table has the four columns, marks the caller's row and asks before deleting", () => {
  const screen = read("routes/settings/staff/staff.tsx")
  const columns = [...screen.matchAll(/<Table\.HeaderCell>\{t\("staff\.columns\.(\w+)"\)\}/g)].map((m) => m[1])
  assert.deepEqual(columns, ["name", "email", "role", "created"])
  assert.match(screen, /member\.is_self \? \(\s*<Badge size="2xsmall">\{t\("staff\.you"\)\}<\/Badge>/)
  assert.match(screen, /await prompt\(\{[\s\S]*?variant: "danger"/)
  assert.match(screen, /description: t\("staff\.delete\.description", \{ email: member\.email \}\)/)
  assert.match(screen, /actions\.canDelete \? \(/, "the caller's own row offers «delete»")
  assert.match(screen, /toast\.error\(staffErrorText\(deleteError, /, "a refused delete shows a general text")
  // The neighbours' parts, no styles of its own.
  for (const part of ["SingleColumnPage", "Container", "Table", "Heading"]) {
    assert.ok(screen.includes(`<${part}`), `the screen does not use ${part}`)
  }
  assert.doesNotMatch(screen, /style=\{|\.css"/)
})

test("the form asks for email, names, role and password, and says under the role what it sees", () => {
  const drawer = read("routes/settings/staff/staff-drawer.tsx")
  for (const field of ["email", "firstName", "lastName", "role"]) {
    assert.ok(drawer.includes(`t("staff.fields.${field}")`), `the form has no ${field} field`)
  }
  assert.match(drawer, /member \? t\("staff\.fields\.newPassword"\) : t\("staff\.fields\.password"\)/)
  assert.match(drawer, /type="password"\s+autoComplete="new-password"/)
  assert.match(drawer, /staffRoleOptions\(roles\)\.map\(\(role\) => \(\s*<Select\.Item key=\{role\} value=\{role\}>/)
  // One line under the select: what the chosen role sees, from the server's list.
  const select = drawer.indexOf("</Select>")
  const hint = drawer.indexOf('data-testid="staff-role-hint"')
  assert.ok(select > 0 && hint > select, "the hint is not under the role select")
  assert.match(drawer, /const sees = roleSees\(roles, draft\.role\)/)
  assert.match(drawer, /sees\.map\(\(permission\) => t\(`staff\.permissions\.\$\{permission\}`\)\)\.join\(", "\)/)
  // The screen hands the server's list to the form.
  const screen = read("routes/settings/staff/staff.tsx")
  assert.match(screen, /const \{ staff, roles, isPending, isError, error \} = useStaff\(\)/)
  assert.equal(screen.match(/roles=\{roles\}/g)?.length, 2, "a form opens without the server's roles")
  // An existing login keeps its email; its own role is locked.
  assert.match(drawer, /disabled=\{!!member\}/)
  assert.match(drawer, /disabled=\{!canChangeRole\}/)
  // A refusal of the server is shown under the fields in its own words.
  assert.match(drawer, /setError\(staffErrorText\(submitError, t\("staff\.errors\.general"\)\)\)/)
  assert.doesNotMatch(drawer, /console\.|localStorage|searchParams/, "a password may reach a log or an address")
})

test("the catalogs name roles and permissions and keep no text about what a role sees", () => {
  for (const language of ["ru", "en"]) {
    const { staff } = JSON.parse(read(`i18n/translations/${language}.json`))
    assert.deepEqual(Object.keys(staff.permissions), [...PERMISSIONS], `${language}: the permission names`)
    assert.deepEqual(Object.keys(staff.roles), ["owner", "manager", "operator"], `${language}: the role names`)
    assert.equal(staff.roleHints, undefined, `${language}: a ready text per role is back`)
    assert.match(staff.roleSees, /\{\{list\}\}/, `${language}: the line has no place for the list`)
  }
})

test("every text of the screen exists in Russian and in English", () => {
  const catalogs = {
    ru: JSON.parse(read("i18n/translations/ru.json")),
    en: JSON.parse(read("i18n/translations/en.json")),
  }
  const lookup = (catalog, key) =>
    key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), catalog)
  const used = new Set()
  for (const file of ["routes/settings/staff/staff.tsx", "routes/settings/staff/staff-drawer.tsx"]) {
    for (const match of read(file).matchAll(/\bt\("([\w.]+)"/g)) {
      used.add(match[1])
    }
  }
  for (const error of ["emailRequired", "passwordTooShort", "nothingChanged", "general"]) {
    used.add(`staff.errors.${error}`)
  }
  for (const permission of PERMISSIONS) {
    used.add(`staff.permissions.${permission}`)
  }
  assert.ok(used.size > 20, `the screen yielded ${used.size} keys, which cannot be right`)
  for (const [language, catalog] of Object.entries(catalogs)) {
    const missing = [...used].filter((key) => typeof lookup(catalog, key) !== "string")
    assert.deepEqual(missing, [], `${language}.json lacks:\n${missing.join("\n")}`)
  }
})
