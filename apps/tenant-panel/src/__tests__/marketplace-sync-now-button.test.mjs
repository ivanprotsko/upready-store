import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Обновить сейчас» (t-2026-09-24-n6, w6-mp-orders-sync-now), on the screen
 * «Wildberries → Обновление» since task-07 of ask-20261005-023327-f02b.
 *
 * `mp-sync.tsx` is JSX this package cannot render (no vitest/jsdom, see
 * error-boundary-auth.test.mjs for the same note), so this asserts on the
 * source directly: the button is busy while the request runs and off without
 * a key, the result is a toast naming what started and what was skipped, a
 * refusal (409 «уже идёт») is the backend's own sentence, the table shows the
 * started kinds as running and looks again while they run, and the POST is the
 * one mutation of the screen.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")
const screenSource = read("routes/marketplaces/mp-sync/mp-sync.tsx")
const warningsSource = read("routes/marketplaces/mp-sync/components/mp-sync-warnings.tsx")
const labelsSource = read("routes/marketplaces/mp-sync/components/kind-label.ts")
const hookSource = read("hooks/api/marketplace-section.tsx")
const tableSource = read("components/table/data-table/data-table.tsx")

/** The «Обновление» block of the hook file, from its banner to the end of the file. */
const syncBlock = hookSource.slice(hookSource.indexOf("«Обновление»: the schedule of one marketplace"))

test("the button is busy while the request runs and off without a key", () => {
  assert.match(
    screenSource,
    /onClick=\{run\} isLoading=\{isSyncing\} disabled=\{!hasKey\}/,
    "«Обновить сейчас» must show the spinner of its own pending request and stay off without a key"
  )
  assert.ok(
    screenSource.includes('t("marketplaceSync.syncNow.button")'),
    "the idle state must show the «Обновить сейчас» label"
  )
})

test("a successful run reports what started and what was skipped, never just one of them", () => {
  const runBlock = screenSource.slice(screenSource.indexOf("const run = async"), screenSource.indexOf("const keyLine"))
  assert.ok(runBlock.includes("toast.success("), "a finished run must toast, not stay silent")
  assert.ok(runBlock.includes('outcome === "started"'), "started kinds must be told apart from skipped ones")
  assert.ok(
    runBlock.includes('outcome === "skipped"'),
    "skipped kinds must be told apart from started ones (rule 20a: a skip is not a silent success)"
  )
  assert.ok(
    runBlock.includes("marketplaceSync.syncNow.toastStarted") &&
      runBlock.includes("marketplaceSync.syncNow.toastSkipped"),
    "the toast description must be able to say both what started and what was skipped"
  )
  assert.ok(
    screenSource.includes("marketplaceSync.syncNow.reasons."),
    "a skipped kind must carry its reason in words"
  )
})

test("a failed request (e.g. 409 «уже идёт») reports the backend's own message, not a silent failure", () => {
  const catchIndex = screenSource.indexOf("} catch (failure)")
  assert.notEqual(catchIndex, -1)
  const catchBlock = screenSource.slice(catchIndex, screenSource.indexOf("const keyLine"))
  assert.ok(catchBlock.includes("toast.error("), "a failed run must tell the owner, not fail silently")
  assert.ok(
    catchBlock.includes("failure.message"),
    "the toast must surface the backend's own Russian sentence (409 sync_in_progress), not a generic one"
  )
})

test("the button posts to this marketplace only", () => {
  assert.match(
    syncBlock,
    /sdk\.client\.fetch<SyncNowResponse>\(`\/tenants\/marketplaces\/\$\{marketplace\}\/sync`, \{ method: "POST" \}\)/,
    "«Обновить сейчас» on one marketplace's screen must start that marketplace, not every one"
  )
})

test("a finished run marks the started kinds running and invalidates the schedule the table reads", () => {
  const onSuccessIndex = syncBlock.indexOf("onSuccess: (data, variables, context)")
  assert.notEqual(onSuccessIndex, -1, "useMpSyncNow must have its own onSuccess")
  const onSuccessBlock = syncBlock.slice(onSuccessIndex, syncBlock.indexOf("onError:", onSuccessIndex))

  assert.ok(
    syncBlock.includes("marketplaceSectionQueryKeys.detail(`${marketplace}-sync`)"),
    "the mutation must address the same query key useMpSync reads"
  )
  assert.ok(
    onSuccessBlock.includes("markStarted(old, data)"),
    "the started kinds must read «идёт» as soon as the answer comes, not after the next poll"
  )
  assert.ok(
    onSuccessBlock.includes("queryClient.invalidateQueries({ queryKey: key"),
    "a finished run must invalidate the schedule the table reads"
  )
  assert.ok(
    onSuccessBlock.includes("marketplaceSyncQueryKeys.all"),
    "the shared schedule (the marketplace card) must not keep the old state either"
  )
  assert.match(syncBlock, /status: "running"/, "markStarted must set the started kinds to running")
})

test("the screen looks again while a kind is running", () => {
  assert.match(
    screenSource,
    /refetchInterval: \(query\) =>\s+query\.state\.data\?\.marketplace\.kinds\.some\(\(kind\) => kind\.status === "running"\)/,
    "a running kind must be followed to its end without a manual reload"
  )
})

test("the POST is the one mutation of the screen", () => {
  for (const [name, source] of [
    ["mp-sync.tsx", screenSource],
    ["mp-sync-warnings.tsx", warningsSource],
    ["kind-label.ts", labelsSource],
  ]) {
    assert.ok(!source.includes("useMutation"), `${name} must not hold a mutation of its own`)
    assert.ok(!/method:\s*"/.test(source), `${name} must not send a request of its own`)
  }
  const mutations = screenSource.match(/use[A-Z]\w*(Now|Mutation|Create|Update|Delete)\b/g) ?? []
  assert.deepEqual([...new Set(mutations)], ["useMpSyncNow"], "useMpSyncNow is the only mutation hook the screen calls")
})

test("no kind or state reaches the screen as its id in Latin", () => {
  assert.ok(
    labelsSource.includes("i18n.exists(`marketplaces.kinds.${kind}`)") && labelsSource.includes('t("mp.sync.otherKind")'),
    "a kind without a translation must read «другие данные», not its id"
  )
  assert.ok(
    labelsSource.includes("i18n.exists(`marketplaces.statuses.${status}`)") &&
      labelsSource.includes('t("mp.sync.otherState")'),
    "a state without a translation must read in words, not as its id"
  )
  for (const [name, source] of [
    ["mp-sync.tsx", screenSource],
    ["mp-sync-warnings.tsx", warningsSource],
  ]) {
    assert.ok(
      !/marketplaces\.(kinds|statuses)\.\$\{[^}]+\}`, \{ defaultValue/.test(source),
      `${name} must not fall back to the raw id through defaultValue`
    )
  }
})

test("without a key the table is empty with its reason, and the warning carries the key button", () => {
  assert.ok(
    screenSource.includes("entry && hasKey ? entry.kinds.filter"),
    "without a key the table must hold no rows of kinds that cannot come in"
  )
  assert.ok(
    screenSource.includes('t("mp.sync.empty.noKeyTitle")') && screenSource.includes('t("mp.sync.empty.noKeyMessage"'),
    "the empty table must name its reason (rule 20a)"
  )
  assert.ok(
    screenSource.includes("<MpSyncWarnings warnings={sync.warnings} keyHref={keyHref} />"),
    "the warnings must get the address of the key"
  )
  assert.match(
    warningsSource,
    /variant=\{warning\.type === "key_expiring" \? "warning" : "error"\}/,
    "a missing or expired key is an error, a key running out a warning"
  )
  assert.ok(warningsSource.includes("<Link to={keyHref}>"), "a key warning must carry the button to the key")
})

test("the table draws no page footer", () => {
  assert.ok(screenSource.includes("pagination={false}"), "one page of kinds needs no «1 — 10 из 10» footer")
  assert.ok(
    tableSource.includes("pagination={pagination !== false}"),
    "_DataTable must pass the flag on, keeping the footer for every list that omits it"
  )
})
