import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-09-25-18 (0.1 + 0.1.1, Ivan verbatim: «не нужно выводить значения
 * свойств под заголовком в строке таблицы» / «вообще нужно запретить писать
 * ячейках строк таблицы что-либо в 2 строки!»): every row of a hand-rolled
 * panel table shows its label on ONE line. A caption that used to sit under
 * it (an options preview, a hint, a slug, a URL, a status detail) is not
 * lost — it moves into a `title` attribute, a native tooltip on hover — but
 * it must never render as a second visible line again.
 *
 * Source assertions, not a render: this package has no vitest/jsdom (see
 * `error-boundary-auth.test.mjs`), the same reason every other panel test
 * here reads the `.tsx` file as text.
 *
 * `/settings/customer-login` is NOT covered here: its radio cards
 * (title + description) are Ivan's own exception (0.1.2), and that screen
 * is not a table.
 *
 * The `reviews/review-list` "Отзыв" cell is not covered either: it is the
 * review's own content (rating, title, body up to 5000 characters, reply
 * box), not a name+caption pair, and forcing it to one line would make a
 * review unreadable. Its "Товар" and "Статус" cells ARE covered, since
 * those two are exactly the name+caption shape this task fixes.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")

const read = (relativePath) => readFileSync(join(SRC, relativePath), "utf8")

test("attribute list: the row shows only the characteristic's name, no options preview line", () => {
  const source = read("routes/product-attributes/attribute-list/attribute-list.tsx")
  assert.ok(
    !source.includes('attribute.options.map((option) => option.label).join(", ")'),
    "the select-type options preview must not render under the attribute name"
  )
  assert.match(
    source,
    /<Text size="small" weight="plus" className="truncate" title=\{attribute\.name\}>/,
    "the name must be single-line (truncate) with the full value in title"
  )
})

// t-2026-09-27-06, measured at 390: the name was one line, but «Выбор из списка» folded
// into three and the two flag badges into two, because the table was squeezed into the
// card. It now scrolls sideways and neither cell wraps.
test("attribute list: type and flags stay on one line, the table scrolls on a phone", () => {
  const source = read("routes/product-attributes/attribute-list/attribute-list.tsx")
  assert.match(source, /<div className="overflow-x-auto">\s*<Table>/, "the table must scroll sideways")
  assert.match(
    source,
    /<Text size="small" className="text-ui-fg-subtle whitespace-nowrap">\s*\{TYPE_LABELS\[attribute\.type\]\}/,
    "the type cell must not wrap"
  )
  assert.ok(
    source.includes('<div className="flex items-center gap-1 whitespace-nowrap">'),
    "the flag badges must not wrap onto a second line"
  )
  assert.ok(!source.includes('"flex flex-wrap items-center gap-1"'), "no wrapping flex row is left")
})

test("page list: the reserved-section row shows only the title, no hint line", () => {
  const source = read("routes/pages/page-list/page-list.tsx")
  assert.ok(
    !/<Text size="small" className="text-ui-fg-subtle">\s*\{section\.hint\}\s*<\/Text>/.test(source),
    "section.hint must not render as its own <Text> under the title"
  )
  assert.ok(source.includes("title={section.hint}"), "the hint must still be reachable, via title")
})

test("page list: a custom page row shows only the title, no machine-key line", () => {
  const source = read("routes/pages/page-list/custom-page-row.tsx")
  assert.ok(
    !/<Text size="small" className="text-ui-fg-subtle font-mono">\s*\{page\.key\}\s*<\/Text>/.test(source),
    "page.key must not render as its own <Text> under the title"
  )
  assert.ok(source.includes("title={page.key}"), "the key must still be reachable, via title")
})

test("course list: the row shows only the course title, no slug line", () => {
  const source = read("routes/courses/course-list/course-list.tsx")
  assert.ok(
    !/<Text size="small" className="text-ui-fg-subtle font-mono">\s*\{course\.slug\}\s*<\/Text>/.test(source),
    "course.slug must not render as its own <Text> under the title"
  )
  assert.ok(source.includes("title={course.slug}"), "the slug must still be reachable, via title")
})

test("article list: the row shows only the article title, no public URL line", () => {
  const source = read("routes/journal/article-list/article-list.tsx")
  assert.ok(
    !/<Text size="small" className="text-ui-fg-subtle font-mono line-clamp-1">\s*\{publicArticleUrl\(primaryHost, group\.slug\)\}\s*<\/Text>/.test(
      source
    ),
    "the public article URL must not render as its own <Text> under the title"
  )
  assert.ok(
    source.includes("title={publicArticleUrl(primaryHost, group.slug)}"),
    "the URL must still be reachable, via title"
  )
})

test("review list: the product cell shows only the product title, no source/language line", () => {
  const source = read("routes/reviews/review-list/review-list.tsx")
  assert.ok(
    !/<Text size="small" className="text-ui-fg-subtle">\s*\{REVIEW_SOURCE_LABEL\[review\.source\]\}, \{languageLabel\(review\.language\)\}\s*<\/Text>/.test(
      source
    ),
    "source/language must not render as its own <Text> under the product title"
  )
})

test("review list: the status cell shows only the badge, no hint line", () => {
  const source = read("routes/reviews/review-list/review-list.tsx")
  assert.ok(
    !/<Text size="small" className="text-ui-fg-subtle">\s*\{REVIEW_STATUS_HINT\[review\.status\]\}\s*<\/Text>/.test(
      source
    ),
    "REVIEW_STATUS_HINT must not render as its own <Text> under the status badge"
  )
  assert.ok(
    source.includes("title={REVIEW_STATUS_HINT[review.status]}"),
    "the hint must still be reachable, via title on the badge"
  )
})

test("marketplace analytics cards table: no metric cell stacks a caption line under its value", () => {
  const source = read(
    "routes/settings/marketplaces/analytics/components/cards-table.tsx"
  )
  for (const removed of [
    '{[card.vendor_code, card.card_id].filter(Boolean).join(" · ") || "—"}',
    "отменено ${card.cancelled_units} шт",
    "{ABC_HINT[card.abc]}",
    "${XYZ_HINT[card.xyz]}, CV ${Math.round(card.variation ?? 0)} %",
    "строк остатка: ${card.turnover.offer_lines}",
    "до ${card.turnover.zero_on}",
  ]) {
    assert.ok(
      !source.includes(`<Text className="text-ui-fg-muted" size="xsmall">\n                ${removed}`),
      `"${removed}" must not render as its own <Text>, only in a title`
    )
  }
})

test("redirect row: the source path shows on one line, the full host+path only in title", () => {
  const source = read("routes/settings/redirects/redirect-row.tsx")
  assert.ok(
    !/<Text size="xsmall" className="text-ui-fg-subtle font-mono">\s*\{primaryHost\}\s*\{redirect\.from_path\}\s*<\/Text>/.test(
      source
    ),
    "the host-qualified path must not render as its own <Text> under from_path"
  )
  assert.ok(
    source.includes("title={primaryHost ? `${primaryHost}${redirect.from_path}` : undefined}"),
    "the full URL must still be reachable, via title"
  )
})

test("shipping methods list: the name and price cells no longer stack a caption under the value", () => {
  const source = read("routes/shipping/shipping-list/shipping-list.tsx")
  assert.ok(
    !source.includes("Служба: {carrierLabel(method.carrier)}"),
    "carrier must not render as its own <Text> under the method name"
  )
  assert.ok(
    !source.includes("Стоимость по умолчанию — укажите свою\n                        </Text>"),
    "the default-price hint must not render as its own <Text> under the price"
  )
})

test("shipping zones: the zone row shows the name on one line, the description only in title", () => {
  const source = read("routes/shipping/shipping-zones/shipping-zones.tsx")
  assert.ok(
    !/<Text size="xsmall" className="text-ui-fg-subtle">\s*\{exists\s*\?\s*"Такой способ уже создан"\s*:\s*preset\.description\}\s*<\/Text>/.test(
      source
    ),
    "the zone description must not render as its own <Text> under the name"
  )
  assert.ok(
    source.includes('title={exists ? "Такой способ уже создан" : preset.description}'),
    "the description must still be reachable, via title on the cell"
  )
})

test("marketplace orders: the status cell shows only the label, no status-detail line", () => {
  const source = read("routes/marketplace-orders/marketplace-orders.tsx")
  assert.ok(
    !/<Text className="text-ui-fg-muted" size="xsmall">\s*\{order\.status_detail\}\s*<\/Text>/.test(source),
    "status_detail must not render as its own <Text> under the status label"
  )
  assert.ok(
    source.includes("title={order.status_detail ?? undefined}"),
    "the detail must still be reachable, via title on the cell"
  )
})
