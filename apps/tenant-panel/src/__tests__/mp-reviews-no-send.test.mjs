import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Wildberries → Отзывы» has no «отправить» (w18-mp-reviews-desk, retargeted
 * onto `routes/marketplaces/mp-reviews` by task-05 of ask-20261005-023327-f02b).
 *
 * Ivan, 2026-09-16 02:46 WITA: the marketplaces are read-only for us, and an
 * answer to a review is a write. The screen keeps a DRAFT in our base and says
 * why there is no send in the backend's own sentence. The JSX cannot be
 * rendered in this package (no vitest/jsdom, see error-boundary-auth.test.mjs),
 * so this asserts on the source of every file of the screen, comments cut, and
 * on the draft hooks it calls.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const SCREEN_DIR = join(SRC, "routes/marketplaces/mp-reviews")

const walk = (dir, found = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, found)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(full)
    }
  }
  return found
}

/** Comments name the forbidden things on purpose; a comment is not a button. */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")

const screenFiles = walk(SCREEN_DIR)
const screen = screenFiles.map((file) => ({ file, source: withoutComments(readFileSync(file, "utf8")) }))
const drawer = screen.find(({ file }) => file.endsWith("mp-review-drawer.tsx"))
const deskHook = withoutComments(readFileSync(join(SRC, "hooks/api/marketplace-desk.tsx"), "utf8"))
const sectionHook = readFileSync(join(SRC, "hooks/api/marketplace-section.tsx"), "utf8")
const reviewsBlock = sectionHook.slice(
  sectionHook.indexOf("«Отзывы»: reviews and questions"),
  sectionHook.indexOf("«Аналитика»: the seller's dashboard")
)

test("the screen is there to be checked: list, drawer and entry", () => {
  assert.ok(screenFiles.length >= 3, `expected the list, the drawer and index.ts, found ${screenFiles.length}`)
  assert.ok(drawer, "components/mp-review-drawer.tsx must exist")
  assert.ok(reviewsBlock.includes("useMpReviews"), "the «Отзывы» block of marketplace-section.tsx must hold useMpReviews")
})

test("no file of the screen calls, names or labels a send or a publish", () => {
  for (const { file, source } of screen) {
    // `sending.reason` is the backend's sentence about WHY there is no send; nothing else may say send.
    const rest = source.replace(/\bsending\??\.reason\b/g, "").replace(/\bsending\b(?=[,\s}])/g, "")
    assert.doesNotMatch(rest, /\b(send|publish)\w*/i, `${file} names a send or a publish`)
    assert.doesNotMatch(rest, /Отправить|Опубликовать|Ответить на площадке/, `${file} labels a send button`)
    assert.doesNotMatch(rest, /\.(send|publish|answer)\w*\(/, `${file} calls a send`)
  }
})

test("the drawer's only buttons are «Сгенерировать» and «Сохранить черновик»", () => {
  const buttons = [...drawer.source.matchAll(/<Button\b[\s\S]*?<\/Button>/g)].map((match) => match[0])
  assert.equal(buttons.length, 2, `expected two buttons in the drawer, found ${buttons.length}`)
  assert.ok(buttons.some((button) => button.includes('t("marketplaces.desk.draft.generate")')))
  assert.ok(buttons.some((button) => button.includes('t("marketplaces.desk.draft.save")')))
})

test("the drawer writes through the two draft hooks and nothing else", () => {
  assert.match(drawer.source, /useSaveDraft\(/)
  assert.match(drawer.source, /useSuggestDraft\(/)
  for (const { file, source } of screen) {
    assert.doesNotMatch(source, /\buseMutation\b/, `${file} has a mutation of its own`)
    assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/, `${file} sends a write by hand`)
  }
  assert.doesNotMatch(reviewsBlock, /useMutation|method:\s*["']POST["']/, "the «Отзывы» hook block reads only")
})

test("the draft hooks reach our own draft and suggest routes, and no answer method", () => {
  const paths = [...deskHook.matchAll(/`(\/tenants\/[^`]*)`/g)].map((match) => match[1])
  const writes = paths.filter((path) => path.endsWith("/draft") || path.endsWith("/suggest"))
  assert.deepEqual(writes.sort(), [
    "/tenants/marketplaces/${kind}/${id}/draft",
    "/tenants/marketplaces/${kind}/${id}/suggest",
  ])
  for (const answer of ["/api/v1/feedbacks/answer", "/v1/review/comment/create", "/v1/question/answer/create"]) {
    assert.ok(!deskHook.includes(answer), `marketplace-desk.tsx names ${answer}`)
  }
})

test("a saved draft refreshes the section's lists, so the row's dot turns «Черновик ответа»", () => {
  assert.match(deskHook, /invalidateQueries\(\{ queryKey: marketplaceSectionQueryKeys\.lists\(\) \}\)/)
  // The caller's options go first: spread last, their onSuccess would replace the refresh.
  const save = deskHook.slice(deskHook.indexOf("export const useSaveDraft"), deskHook.indexOf("export const useSuggestDraft"))
  assert.ok(save.indexOf("...options") < save.indexOf("onSuccess: async"), "useSaveDraft must spread options before its own onSuccess")
})

test("«Сгенерировать» is off without a generator, with one hint in the drawer and none in the rows", () => {
  assert.match(drawer.source, /disabled=\{!generatorAvailable\}/)
  assert.match(drawer.source, /<SupportDetails text=\{generator\.reason\} \/>/)
  const list = screen.find(({ file }) => file.endsWith("mp-reviews.tsx"))
  assert.doesNotMatch(list.source, /generator(?:\?)?\.reason|generatorOff/, "the list must not repeat the hint per row")
})
