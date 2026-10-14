import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import i18n from "i18next"

import { OWNER_ROUTES, PARAM_RESOLVERS } from "../../e2e/owner-routes.mjs"
import {
  REPLY_MAX_LENGTH,
  reviewLanguageLabel,
  reviewOrigin,
  reviewStatusLabel,
  statusMoves,
} from "../routes/reviews/labels.ts"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G5 «Отзывы»): /reviews rebuilt
 * after the prototype and read like Wildberries → «Отзывы» (Ivan 14.10.2026
 * ~23:45). `_DataTable` with filters, search and sort in the address; a row
 * opens the review in a drawer at /reviews/:id; the answer is a second drawer
 * at /reviews/:id/reply; publishing, hiding and deleting are in «…». This
 * package cannot render JSX (see `settings-detail-edit-drawer.test.mjs`), so
 * the screens are asserted on their source; the labels, the status moves and
 * the plural forms run for real against ru.json.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

const DIR = "routes/reviews"
const FILES = [
  `${DIR}/labels.ts`,
  `${DIR}/use-review-actions.tsx`,
  `${DIR}/components/review-stars.tsx`,
  `${DIR}/review-list/review-list.tsx`,
  `${DIR}/review-list/use-review-table.tsx`,
  `${DIR}/review-detail/review-detail.tsx`,
  `${DIR}/review-reply/review-reply.tsx`,
]
const list = read(`${DIR}/review-list/review-list.tsx`)
const table = read(`${DIR}/review-list/use-review-table.tsx`)
const actions = read(`${DIR}/use-review-actions.tsx`)
const detail = read(`${DIR}/review-detail/review-detail.tsx`)
const reply = read(`${DIR}/review-reply/review-reply.tsx`)
const hooks = read("hooks/api/reviews.tsx")

/** The source without its comments, for «no literal on screen» checks. */
const code = (source) =>
  source.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "")

await i18n.init({
  lng: "ru",
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
})
const t = i18n.getFixedT("ru")

// ── the router and the walker ───────────────────────────────────────────────

test("the review and its reply are drawers nested under the list; the crumb is a key", () => {
  const start = app.indexOf('path: "/reviews",')
  const block = app.slice(start, app.indexOf("},\n          {", app.indexOf("children: [", start)))
  assert.ok(block.includes('breadcrumb: () => t("reviews.title")'), "the crumb reads the key")
  assert.ok(!block.includes("defaultValue"), "no literal fallback in the crumb (rule 7)")
  assert.ok(block.includes('lazy: () => import("./routes/reviews/review-list")'))
  assert.ok(block.includes('{ path: ":id", lazy: () => import("./routes/reviews/review-detail") }'))
  assert.ok(block.includes('{ path: ":id/reply", lazy: () => import("./routes/reviews/review-reply") }'))
})

test("each route module hands the router its screen", () => {
  assert.match(read(`${DIR}/review-list/index.ts`), /ReviewList as Component/)
  assert.match(read(`${DIR}/review-detail/index.ts`), /ReviewDetail as Component/)
  assert.match(read(`${DIR}/review-reply/index.ts`), /ReviewReply as Component/)
})

test("every new address is in the owner route manifest as an overlay, with a resolver for the review", async () => {
  const byPath = new Map(OWNER_ROUTES.map((route) => [route.path, route]))
  assert.equal(byPath.get("/reviews")?.core, true)
  assert.ok(byPath.has("/reviews?q=zzzz-nothing-matches"), "the empty search result is walked")
  assert.equal(byPath.get("/reviews/:review_id")?.kind, "overlay")
  assert.equal(byPath.get("/reviews/:review_id/reply")?.kind, "overlay")
  const api = async (path) => {
    assert.equal(path, "/tenants/reviews?limit=1")
    return { reviews: [{ id: "prev_1" }] }
  }
  assert.equal(await PARAM_RESOLVERS.review_id(api), "prev_1")
  await assert.rejects(PARAM_RESOLVERS.review_id(async () => ({ reviews: [] })), /no reviews/)
})

// ── the list ────────────────────────────────────────────────────────────────

test("the list is _DataTable with filters, search, sort and pages, all in the address", () => {
  assert.ok(list.includes("<_DataTable"))
  for (const prop of ["filters={filters}", "search\n", "pagination\n", "queryObject={raw}"]) {
    assert.ok(list.includes(prop), `the table takes ${prop.trim()}`)
  }
  assert.ok(list.includes('{ key: "written_at", label: t("reviews.columns.date") }'))
  assert.ok(list.includes('{ key: "rating", label: t("reviews.columns.rating") }'))
  assert.ok(table.includes('useQueryParams(["offset", "order", "q", ...FILTER_KEYS])'), "the address is the state")
  assert.ok(list.includes("navigateTo={(row) => `/reviews/${row.original.id}${search}`}"), "a row opens its drawer and keeps the filters under it")
})

test("the row carries no button, no form, no bin: everything moved into «…» and the drawers", () => {
  for (const source of [list, table]) {
    for (const gone of ["<Table>", "<Button", "<Textarea", "<Select", "<Trash", "usePrompt", "mutateAsync", "useState"]) {
      assert.ok(!source.includes(gone), `the list must not carry ${gone} any more`)
    }
  }
})

test("columns read like Wildberries → «Отзывы»: Оценка · Отзыв · Товар · Покупатель · Дата · Ответ · Статус · «…»", () => {
  const order = [
    'columnHelper.accessor("rating"',
    'columnHelper.accessor("body"',
    'id: "product"',
    'columnHelper.accessor("author_name"',
    'columnHelper.accessor("written_at"',
    'columnHelper.accessor("reply"',
    'columnHelper.accessor("status"',
    'id: "actions"',
  ].map((needle) => {
    const index = table.indexOf(needle)
    assert.ok(index !== -1, `missing ${needle}`)
    return index
  })
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.ok(table.includes('className="truncate"'), "the review's text is one line")
  assert.ok(table.includes("getFullDate({ date })"), "dates through getFullDate (rule 14)")
  assert.ok(table.includes('t("reviews.dateUnknown")'), "an undated import says so")
})

test("filters: status, rating and answer first, then product and source (the lead's G5 decision)", () => {
  assert.ok(table.includes('FILTER_KEYS = ["status", "rating", "answered", "product_id", "source"] as const'))
  const at = (key) => table.indexOf(`key: "${key}",`)
  assert.ok(at("status") < at("rating") && at("rating") < at("answered"))
  assert.ok(at("answered") < at("product_id") && at("product_id") < at("source"))
})

test("the list's query goes out one parameter per item", () => {
  assert.ok(hooks.includes("params.append(key, String(item))"))
  assert.ok(hooks.includes("`/tenants/reviews/${id}`"), "one review is read on its own for the drawer")
})

test("the header counts the reviews waiting, in Russian plural forms", () => {
  assert.ok(list.includes('useTenantReviews({ status: "pending", limit: 1 })'))
  assert.ok(list.includes('t("reviews.pending", { count: pending })'))
  assert.equal(t("reviews.pending", { count: 1 }), "1 отзыв ждёт проверки")
  assert.equal(t("reviews.pending", { count: 3 }), "3 отзыва ждут проверки")
  assert.equal(t("reviews.pending", { count: 5 }), "5 отзывов ждут проверки")
  assert.equal(t("reviews.pending", { count: 21 }), "21 отзыв ждёт проверки")
  assert.equal(t("reviews.stars", { count: 5 }), "5 звёзд")
  assert.equal(t("reviews.stars", { count: 2 }), "2 звезды")
})

test("no reviews at all is NoRecords without a button; a filter with no result is NoResults (E8, rule 10)", () => {
  assert.ok(list.includes('title: t("reviews.empty.title")'))
  assert.ok(list.includes('message: t("reviews.empty.message")'))
  assert.ok(!list.includes("action={"), "a review is left by a customer, there is nothing to create")
  assert.equal(ru.reviews.empty.title, "Отзывов пока нет")
})

// ── «…» ─────────────────────────────────────────────────────────────────────

test("the status moves: pending → publish; published → hide or back; hidden → publish or back", () => {
  assert.deepEqual(statusMoves("pending"), ["published"])
  assert.deepEqual(statusMoves("published"), ["hidden", "pending"])
  assert.deepEqual(statusMoves("hidden"), ["published", "pending"])
  assert.equal(t("reviews.actions.hidden"), "Скрыть со страницы товара")
})

test("«…»: open and reply, then the status moves, then «Удалить» last, red, behind a prompt (E6, rules 8, 21)", () => {
  const groups = actions.slice(actions.indexOf("const groups"))
  const open = groups.indexOf('t("reviews.actions.open")')
  const answer = groups.indexOf('t("reviews.actions.reply")')
  const moves = groups.indexOf("statusMoves(review.status)")
  const remove = groups.indexOf('label: t("actions.delete")')
  assert.ok(open !== -1 && open < answer && answer < moves && moves < remove)
  assert.ok(groups.slice(remove).includes("destructive: true"))
  assert.ok(actions.includes('title: t("reviews.delete.title")'))
  assert.ok(actions.includes('description: t("reviews.delete.description", { author: review.author_name })'))
  assert.match(ru.reviews.delete.description, /скройте/, "the prompt says how deleting differs from hiding")
  assert.ok(table.includes('aria-label={t("fields.actions")}'), "the row's «…» has a name")
})

// ── the drawers ─────────────────────────────────────────────────────────────

test("the review's drawer reads only; «Ответить» is its one primary action, «…» is in its header", () => {
  assert.ok(detail.includes("<RouteDrawer>"))
  for (const gone of ["<form", "<Textarea", "<Input", "RouteDrawer.Form"]) {
    assert.ok(!detail.includes(gone), `the read drawer must not carry ${gone}`)
  }
  assert.ok(detail.includes("<SectionRow"), "rows are SectionRow")
  assert.ok(detail.includes("groups({})"), "the drawer's «…» has no «Открыть» and no second «Ответить»")
  assert.ok(detail.includes("`/reviews/${review.id}/reply${search}`"))
  assert.ok(detail.includes('t("actions.close")'))
  assert.ok(detail.includes("onDeleted: () => navigate(`/reviews${search}`, { replace: true })"), "a deleted review closes its drawer")
})

test("the reply drawer: quote, one field, one «Отмена / Отправить» pair; «Сохранить» and «Удалить ответ» when an answer exists", () => {
  assert.ok(reply.includes("<RouteDrawer.Form form={form}>"), "a dirty close asks first")
  assert.ok(reply.includes("<KeyboundForm"), "⌘Enter sends")
  assert.ok(reply.includes("<ReviewQuote review={review} />"))
  assert.equal(reply.match(/<Textarea/g)?.length, 1)
  assert.ok(reply.includes('hadReply ? t("actions.save") : t("reviews.replyForm.send")'))
  assert.ok(reply.includes("{review?.reply ? <ReplyMenu review={review} /> : null}"))
  assert.ok(reply.includes('label: t("reviews.actions.deleteReply")'))
  assert.ok(reply.includes("mutateAsync({ reply: null })"))
  assert.ok(reply.includes("maxLength={REPLY_MAX_LENGTH}"))
  assert.equal(REPLY_MAX_LENGTH, 5000, "the backend's limit")
  assert.equal(t("reviews.replyForm.counter", { count: "148", max: "5 000" }), "148 из 5 000")
})

test("the toasts are the prototype's short phrases", () => {
  assert.deepEqual(ru.reviews.toasts, {
    published: "Отзыв опубликован",
    hidden: "Отзыв скрыт со страницы товара",
    pending: "Отзыв возвращён на проверку",
    replySent: "Ответ отправлен",
    replySaved: "Ответ сохранён",
    replyDeleted: "Ответ удалён",
    deleted: "Отзыв удалён",
  })
  assert.ok(actions.includes("toast.success(t(`reviews.toasts.${status}`))"))
})

// ── words ───────────────────────────────────────────────────────────────────

test("where a review came from reads «с витрины · русский»; an unknown language keeps its tag", () => {
  assert.equal(reviewOrigin(t, "shop", "ru"), "с витрины · русский")
  assert.equal(reviewOrigin(t, "wb", "RU"), "с Wildberries · русский")
  assert.equal(reviewLanguageLabel(t, "pt-BR"), "pt-BR")
  assert.equal(reviewStatusLabel(t, "pending"), "На проверке")
})

test("every i18n key the review screens read exists in ru.json and en.json", () => {
  const keys = new Set(
    FILES.flatMap((path) => [...read(path).matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))
  )
  assert.ok(keys.size > 30, `expected the screens' keys, found ${keys.size}`)
  const dynamic = ["status", "statusHint", "source", "toasts"].flatMap((group) =>
    Object.keys(ru.reviews[group]).map((key) => `reviews.${group}.${key}`)
  )
  for (const key of [...keys, ...dynamic]) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("no Russian literal and no English fallback on screen (rule 7)", () => {
  for (const path of FILES) {
    const source = code(read(path))
    assert.ok(!/[А-Яа-яЁё]/.test(source), `${path}: a Russian literal outside a key`)
    assert.ok(!/\bdefaultValue\s*:/.test(source), `${path}: a defaultValue fallback`)
  }
})
