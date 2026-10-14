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
  staffRoleColor,
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

test("the form never offers the platform's developer, even when the server lists it", () => {
  // t-2026-10-14-41: only the platform gives the role.
  assert.deepEqual(
    staffRoleOptions([...ROLES, { role: "developer", permissions: [...PERMISSIONS] }]),
    ["owner", "manager", "operator"]
  )
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

test("a new login needs an email and a password of eight characters", () => {
  assert.equal(STAFF_PASSWORD_MIN, 8)
  assert.deepEqual(createStaffBody({ ...emptyStaffDraft(), password: PASSWORD }), { error: "emailRequired" })
  assert.deepEqual(
    createStaffBody({ ...emptyStaffDraft(), email: "packer@shop.test", password: "sevench" }),
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
  assert.deepEqual(staffRowActions(self), { canEdit: true, canDelete: false, canChangeRole: false })
  assert.deepEqual(staffRowActions(member()), { canEdit: true, canDelete: true, canChangeRole: true })
  assert.deepEqual(updateStaffBody(self, { ...draftOfStaff(self), role: "operator", lastName: "Sokolova" }), {
    body: { last_name: "Sokolova" },
  })
  assert.deepEqual(updateStaffBody(self, { ...draftOfStaff(self), role: "operator" }), {
    error: "nothingChanged",
  })
})

test("the platform developer's row offers no form and no delete, not even to itself", () => {
  // t-2026-10-14-41: the shop changes nothing on it; the server refuses both anyway.
  const none = { canEdit: false, canDelete: false, canChangeRole: false }
  assert.deepEqual(staffRowActions(member({ role: "developer" })), none)
  assert.deepEqual(staffRowActions(member({ role: "developer", is_self: true })), none)
})

// ---------------------------------------------------------------- what the table shows

test("a row shows the name, and a role the panel has no name for as the server spelled it", () => {
  assert.equal(staffName(member()), "Vera Lugovaya")
  assert.equal(staffName(member({ first_name: null, last_name: null })), "")
  assert.equal(staffRoleOf(member()), "operator")
  assert.equal(staffRoleOf(member({ role: "developer" })), "developer")
  assert.equal(staffRoleOf(member({ role: "auditor" })), null)
  assert.equal(draftOfStaff(member({ first_name: null })).firstName, "")
  assert.equal(draftOfStaff(member({ role: "auditor" })).role, "auditor", "an edit keeps a role as it is")
})

test("the role is a badge, and the developer's stands apart in its own colour", () => {
  assert.equal(staffRoleColor("developer"), "purple")
  for (const role of ["owner", "manager", "operator", "auditor"]) {
    assert.equal(staffRoleColor(role), "grey", role)
  }
  const screen = read("routes/settings/staff/staff.tsx")
  assert.match(
    screen,
    /<StatusBadge color=\{staffRoleColor\(member\.role\)\} data-testid="staff-role-badge">\s*\{role \? t\(`staff\.roles\.\$\{role\}`\) : member\.role\}/
  )
  // The developer's row has no «…» at all; every other row offers «Изменить».
  const menu = read("routes/settings/staff/staff-actions.tsx")
  assert.match(menu, /if \(!actions\.canEdit\) \{\s*return \[\]/, "the developer's row offers «edit»")
  assert.match(menu, /if \(!groups\.length\) \{\s*return null/, "an empty menu still draws «…»")
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
  assert.match(app, /path: "\/settings\/staff",[\s\S]{0,400}lazy: \(\) => import\("\.\/routes\/settings\/staff"\)/)
  assert.match(read("routes/settings/staff/index.ts"), /export \{ Staff as Component \}/)
  // t-2026-10-14-01 (G2): the card and the two drawers hang under the same
  // entry, so every address of the screen needs the same permission.
  for (const path of ["/settings/staff/create", "/settings/staff/ta_2", "/settings/staff/ta_2/edit"]) {
    assert.equal(permissionOfPath(path), "staff", path)
  }
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

test("the list is a _DataTable of four columns; it marks the caller's row and asks before deleting", () => {
  const screen = read("routes/settings/staff/staff.tsx")
  const columns = [...screen.matchAll(/header: t\("staff\.columns\.(\w+)"\)/g)].map((m) => m[1])
  assert.deepEqual(columns, ["name", "email", "role", "created"])
  assert.match(screen, /row\.original\.is_self \? <Badge size="2xsmall">\{t\("staff\.you"\)\}<\/Badge>/)
  // A row opens the card; the add form is the nested route `create`.
  assert.ok(screen.includes("navigateTo={(row) => `/settings/staff/${row.original.id}`}"))
  assert.ok(screen.includes('<Link to="/settings/staff/create">'))
  assert.ok(screen.includes("hasOutlet"), "the create drawer opens in the list's outlet")
  assert.doesNotMatch(screen, /useState|<Drawer|<IconButton|<Table\b/, "no state-flag drawer, no icon buttons in the row")
  // «Удалить» asks first, names the person and the address and is the last group of «…».
  const remove = read("routes/settings/staff/use-staff-delete.ts")
  assert.match(remove, /await prompt\(\{[\s\S]*?variant: "danger"/)
  assert.match(remove, /t\("staff\.delete\.description", \{ name, email: member\.email \}\)/)
  assert.match(remove, /t\("staff\.delete\.descriptionNoName", \{ email: member\.email \}\)/)
  const menu = read("routes/settings/staff/staff-actions.tsx")
  assert.match(menu, /if \(actions\.canDelete\) \{\s*groups\.push/, "the caller's own row offers «delete»")
  assert.ok(menu.indexOf('t("actions.change")') < menu.indexOf('t("actions.delete")'))
  assert.ok(menu.includes('aria-label={t("fields.actions")}'))
  // The neighbours' parts, no styles of its own.
  for (const part of ["SingleColumnPage", "Container", "_DataTable", "Heading"]) {
    assert.ok(screen.includes(`<${part}`), `the screen does not use ${part}`)
  }
  assert.doesNotMatch(screen, /style=\{|\.css"/)
})

test("the card reads one login: name in the header, role badge, «Видит», created with the time", () => {
  const card = read("routes/settings/staff/staff-detail/staff-detail.tsx")
  assert.ok(card.includes("<SettingsDetail"))
  for (const forbidden of ["<form", "<Input", "<Select", "mutateAsync", "actions.save"]) {
    assert.ok(!card.includes(forbidden), `the card must not carry ${forbidden}`)
  }
  assert.ok(card.includes("title: staffName(member) || member.email"))
  assert.ok(card.includes("status: { color: staffRoleColor(member.role), label: roleName }"))
  const rows = [...card.matchAll(/\{ id: "([\w-]+)", label: t\(/g)].map((m) => m[1])
  assert.deepEqual(rows, ["first-name", "last-name", "email", "role", "sees"])
  assert.ok(card.includes('id: "created"') && card.includes("getFullDate({ date: member.created_at, includeTime: true })"))
  assert.ok(card.includes('navigate("/settings/staff", { replace: true })'), "after «Удалить» the owner is back on the list")
  assert.ok(card.includes('t("staff.refusals.developer_row")'), "the developer's card says why it has no «…»")
  // The card reads the list: the backend has no GET by id.
  const member = read("routes/settings/staff/use-staff-member.ts")
  assert.ok(member.includes("useStaff()") && member.includes('new FetchError("Staff member not found", "Not Found", 404)'))
})

test("the form is a route drawer that asks for email, names, role and password, and says under the role what it sees", () => {
  const drawer = read("routes/settings/staff/staff-drawer.tsx")
  assert.ok(drawer.includes("<SettingsEditDrawer<StaffDraft>"))
  for (const field of ["email", "firstName", "lastName", "role"]) {
    assert.ok(drawer.includes(`t("staff.fields.${field}")`), `the form has no ${field} field`)
    assert.ok(drawer.includes(`name="${field}"`), `the form has no ${field} control`)
  }
  assert.match(drawer, /member \? t\("staff\.fields\.newPassword"\) : t\("staff\.fields\.password"\)/)
  assert.match(drawer, /type="password" autoComplete="new-password"/)
  assert.match(drawer, /staffRoleOptions\(roles\)\.map\(\(option\) => \(\s*<Select\.Item key=\{option\} value=\{option\}>/)
  // One line under the select: what the chosen role sees, from the server's list.
  const select = drawer.indexOf("</Select>")
  const hint = drawer.indexOf('data-testid="staff-role-hint"')
  assert.ok(select > 0 && hint > select, "the hint is not under the role select")
  assert.match(drawer, /roleSees\(roles, role\)\s*\.map\(\(permission\) => t\(`staff\.permissions\.\$\{permission\}`\)\)\s*\.join\(", "\)/)
  // An existing login keeps its email and says why; its own role is locked.
  assert.match(drawer, /disabled=\{!!member\}/)
  assert.match(drawer, /disabled=\{!canChangeRole\}/)
  assert.ok(drawer.includes('t("staff.fields.emailLocked")'))
  // The form refuses a short password and an empty email at the field.
  assert.ok(drawer.includes("zod.string().min(STAFF_PASSWORD_MIN, { message: tooShort })"))
  assert.ok(drawer.includes('min(1, { message: t("staff.errors.emailRequired") })'))
  // «Добавить» on a new login, «Сохранить» on an edit.
  assert.ok(drawer.includes('submitText={editing ? undefined : t("staff.create.submit")}'))
  assert.doesNotMatch(drawer, /console\.|localStorage|searchParams/, "a password may reach a log or an address")
  // Both drawers wait for the list, which brings the roles.
  for (const file of ["staff-create.tsx", "staff-edit.tsx"]) {
    const route = read(`routes/settings/staff/${file}`)
    assert.ok(route.includes("<StaffDrawer") && route.includes("roles={roles}"), file)
    assert.ok(route.includes("export { "), `${file} exports Component`)
  }
  assert.ok(read("routes/settings/staff/staff-edit.tsx").includes('<Navigate to=".." replace />'), "no form on the developer's login")
})

test("the catalogs name roles and permissions and keep no text about what a role sees", () => {
  for (const language of ["ru", "en"]) {
    const { staff } = JSON.parse(read(`i18n/translations/${language}.json`))
    assert.deepEqual(Object.keys(staff.permissions), [...PERMISSIONS], `${language}: the permission names`)
    assert.deepEqual(
      Object.keys(staff.roles),
      ["owner", "manager", "operator", "developer"],
      `${language}: the role names`
    )
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
  for (const file of [
    "routes/settings/staff/staff.tsx",
    "routes/settings/staff/staff-drawer.tsx",
    "routes/settings/staff/staff-actions.tsx",
    "routes/settings/staff/use-staff-delete.ts",
    "routes/settings/staff/staff-detail/staff-detail.tsx",
  ]) {
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
