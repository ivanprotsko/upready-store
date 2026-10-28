import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-20-30, Ivan's marks of 25.10 on the real panel's screens for the
 * landing, fixed in the shared parts (the lead's d-2026-10-25-17):
 * - on «Своего домена пока нет»: «нельзя центрировать текст и контролы». Both
 *   empty states of the panel sit at the start, for every screen that uses them;
 * - on «Основной адрес» at 375: «не надо верстать в 2 колонки. заголовок
 *   сделать светлее чем значение». A settings row is one column below `sm` and
 *   its label is a lighter grey than its value.
 * This package cannot render JSX, so the contract is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const empty = read("components/common/empty-table-content/empty-table-content.tsx")
const row = read("components/common/section/section-row.tsx")
const detail = read("components/settings/settings-detail/settings-detail.tsx")

const componentOf = (source, name) => {
  const start = source.indexOf(`export const ${name} =`)
  assert.ok(start !== -1, `${name} is exported`)
  const end = source.indexOf("\nexport ", start + 1)
  return source.slice(start, end === -1 ? undefined : end)
}

const CENTRING = /\b(items-center|justify-items-center|text-center|mx-auto|self-center|place-items-center)\b/
const ACROSS = /\b(justify-items-center|text-center|mx-auto|place-items-center)\b/

for (const name of ["NoResults", "NoRecords"]) {
  test(`${name}: icon, title, message and button sit at the start, never centred`, () => {
    const source = componentOf(empty, name)
    const classes = [...source.matchAll(/"([^"]*\b(?:flex|grid)\b[^"]*)"/g)].map((m) => m[1])
    assert.ok(classes.length >= 2, `${name} has its layout classes`)
    // Across, not down: in a column `items-*` places across, in a row `justify-*` does.
    // The box keeps its height and its content in the middle of it, top to bottom.
    for (const cls of classes) {
      const across = /\bflex-col\b/.test(cls) ? /\bitems-center\b/ : /\bjustify-center\b/
      assert.doesNotMatch(cls, across, `${name}: «${cls}» centres across`)
      assert.doesNotMatch(cls, ACROSS, `${name}: «${cls}» centres`)
    }
    assert.ok(classes.some((cls) => /\bitems-start\b/.test(cls) && /\btext-start\b/.test(cls)), `${name}: the column starts at the left`)
    assert.ok(classes.some((cls) => /\bpx-6\b/.test(cls)), `${name}: at the rows' 24px inset`)
  })
}

test("no caller centres the empty state from outside", () => {
  for (const file of [
    "routes/settings/payments/components/manual-payment-card.tsx",
    "routes/home-settings/components/home-banners-list.tsx",
  ]) {
    const source = read(file)
    const at = source.indexOf("<NoRecords")
    const wrapper = source.slice(source.lastIndexOf("<div", at), at)
    assert.doesNotMatch(wrapper, CENTRING, `${file}: the wrapper centres the empty state`)
  }
})

test("a settings row is one column below sm, two from sm", () => {
  assert.ok(row.includes('variant?: "default" | "setting"'))
  assert.ok(row.includes('"max-sm:grid-cols-1 max-sm:items-start max-sm:gap-1": setting && !actions'))
  assert.ok(row.includes("grid w-full grid-cols-2"), "from sm the label and the value stand side by side")
  const rows = detail.slice(detail.indexOf("{section.body ??"))
  assert.ok(rows.includes("<SectionRow") && rows.includes('variant="setting"'), "every settings section's rows take it")
})

test("the label is lighter than the value: subtle grey label, base ink value", () => {
  assert.ok(row.includes('weight={setting ? "regular" : "plus"}'), "the label is not bold")
  assert.ok(row.includes('className={clx({ "text-ui-fg-subtle": setting })}'), "the label is the subtle grey")
  assert.ok(row.includes('{ "text-ui-fg-base": setting }'), "the value's cell is the base ink")
  const value = detail.slice(detail.indexOf("const SettingsRowValue"), detail.indexOf("export const SettingsDetailSection"))
  assert.equal((value.match(/className=\{?"?[^>]*text-ui-fg-base/g) ?? []).length, 2, "the value and the «—» are the base ink")
  // The hint stays under the value, in the subtle grey.
  assert.ok(value.indexOf("{row.hint ?") > value.indexOf("{row.value}"))
})

test("NoRecords grows with its text: a minimum height and its own top and bottom inset, not a fixed 150px", () => {
  const source = componentOf(empty, "NoRecords")
  assert.ok(source.includes("min-h-[150px]") && source.includes("py-6"))
  assert.ok(!source.includes('"flex h-[150px]'), "a fixed height crops a message that wraps on a phone")
})
