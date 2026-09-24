import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Обновить сейчас» (t-2026-09-24-n6, w6-mp-orders-sync-now).
 *
 * `sync-now-button.tsx` is JSX this package cannot render (no vitest/jsdom,
 * see error-boundary-auth.test.mjs for the same note), so this asserts on the
 * source directly: the three states Ivan asked for by name — idle, running
 * with a disabled button and a spinner, and the result as a toast — and that
 * the query the status table reads from is invalidated so the table actually
 * refreshes rather than only the toast changing.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const buttonSource = readFileSync(
  join(SRC, "routes/settings/marketplace-sync/components/sync-now-button.tsx"),
  "utf8"
)
const hookSource = readFileSync(join(SRC, "hooks/api/marketplace-sync.tsx"), "utf8")

test("the button is disabled while the mutation is pending", () => {
  assert.match(
    buttonSource,
    /disabled=\{isPending\}/,
    "the button must be disabled by the same isPending the running label reads (t-2026-09-24-n6)"
  )
})

test("while running the button shows the spinner and the running label, not the idle one", () => {
  const ternaryIndex = buttonSource.indexOf("isPending ? (")
  assert.notEqual(ternaryIndex, -1, "the idle/running ternary is missing")

  const runningBlock = buttonSource.slice(
    ternaryIndex,
    buttonSource.indexOf(") : (", ternaryIndex)
  )
  assert.ok(runningBlock.includes("<Spinner"), "the running state must render a spinner")
  assert.ok(
    runningBlock.includes('t("marketplaceSync.syncNow.running")'),
    "the running state must show the «Обновляется…» label"
  )

  const idleBlock = buttonSource.slice(
    buttonSource.indexOf(") : (", ternaryIndex),
    buttonSource.indexOf(")}\n    </Button>")
  )
  assert.ok(
    idleBlock.includes('t("marketplaceSync.syncNow.button")'),
    "the idle state must show the «Обновить сейчас» label"
  )
})

test("a successful run reports what started and what was skipped, never just one of them", () => {
  assert.ok(buttonSource.includes("toast.success("), "a finished run must toast, not stay silent")
  assert.ok(
    buttonSource.includes('outcome === "started"'),
    "started kinds must be told apart from skipped ones"
  )
  assert.ok(
    buttonSource.includes('outcome === "skipped"'),
    "skipped kinds must be told apart from started ones (rule 20a: a skip is not a silent success)"
  )
  assert.ok(
    buttonSource.includes("marketplaceSync.syncNow.toastStarted") &&
      buttonSource.includes("marketplaceSync.syncNow.toastSkipped"),
    "the toast description must be able to say both what started and what was skipped"
  )
})

test("a failed request (e.g. 409 «уже идёт») reports the backend's own message, not a silent failure", () => {
  const tryIndex = buttonSource.indexOf("try {")
  const catchIndex = buttonSource.indexOf("} catch (error)")
  assert.notEqual(tryIndex, -1)
  assert.notEqual(catchIndex, -1)

  const catchBlock = buttonSource.slice(catchIndex)
  assert.ok(catchBlock.includes("toast.error("), "a failed run must tell the owner, not fail silently")
  assert.ok(
    catchBlock.includes("error.message"),
    "the toast must surface the backend's own Russian sentence (409 sync_in_progress), not a generic one"
  )
})

test("a finished run invalidates the sync query so the status table refreshes on its own", () => {
  const onSuccessIndex = hookSource.indexOf("onSuccess: (data, variables, context)")
  assert.notEqual(onSuccessIndex, -1, "useSyncMarketplacesNow must have its own onSuccess")

  const onSuccessBlock = hookSource.slice(onSuccessIndex, hookSource.indexOf("},", onSuccessIndex))
  assert.ok(
    onSuccessBlock.includes("queryClient.invalidateQueries") &&
      onSuccessBlock.includes("marketplaceSyncQueryKeys.all"),
    "a finished run must invalidate the same query the status table reads, or the table would need a manual reload"
  )
})
