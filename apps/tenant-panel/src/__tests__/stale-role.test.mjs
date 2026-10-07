import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { ME_QUERY_KEY, isForbidden, shouldRefreshMe } from "../lib/stale-role.ts"

/**
 * A role changed while the panel was open (t-2026-10-07-11, addendum 13).
 * Before this the panel kept the old permissions until a reload and showed a
 * general error on the server's 403. Now any 403 from a shop route throws the
 * «who am I» answer away, the sidebar and the route guard take the new
 * permissions, and the screen says «Нет доступа».
 *
 * `lib/query-client.ts` is the panel's real query client: it is imported and
 * a refused request is run through it. The React side is read as source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(here, "..", path), "utf8")

// The one build-time constant `lib/query-client.ts` reads at load.
globalThis.__BACKEND_URL__ = ""
const { queryClient } = await import("../lib/query-client.ts")

const refusal = (status) => Object.assign(new Error("refused"), { status })
const ME = { user: { id: "ta_1", role: "manager", permissions: ["orders", "catalog"] } }
const seedMe = () => {
  queryClient.clear()
  queryClient.setQueryData(ME_QUERY_KEY, ME)
}
const meIsStale = () => queryClient.getQueryState(ME_QUERY_KEY)?.isInvalidated === true
const failingQuery = (key, status) =>
  queryClient
    .fetchQuery({ queryKey: key, queryFn: () => Promise.reject(refusal(status)), retry: false })
    .catch(() => undefined)

test("only a 403 is the sign of a changed role, and never the 403 of «who am I» itself", () => {
  assert.deepEqual([...ME_QUERY_KEY], ["users", "me"])
  assert.equal(isForbidden(refusal(403)), true)
  for (const status of [400, 401, 404, 500]) {
    assert.equal(shouldRefreshMe(refusal(status), ["orders"]), false, `status ${status}`)
  }
  assert.equal(shouldRefreshMe(refusal(403), ["orders", "list"]), true)
  assert.equal(shouldRefreshMe(refusal(403)), true, "a refused change, which has no query key")
  assert.equal(shouldRefreshMe(refusal(403), ["users", "me"]), false, "asking again would loop")
  assert.equal(shouldRefreshMe(new Error("offline"), ["orders"]), false)
  assert.equal(shouldRefreshMe(undefined, ["orders"]), false)
})

test("a read the server answers 403 throws the «who am I» answer away", async () => {
  seedMe()
  assert.equal(meIsStale(), false)
  await failingQuery(["products", "list"], 403)
  assert.equal(meIsStale(), true)
})

test("a change the server answers 403 throws it away too", async () => {
  seedMe()
  const mutation = queryClient
    .getMutationCache()
    .build(queryClient, { mutationFn: () => Promise.reject(refusal(403)), retry: false })
  await mutation.execute(undefined).catch(() => undefined)
  assert.equal(meIsStale(), true)
})

test("any other failure leaves it alone", async () => {
  for (const status of [400, 401, 404, 500]) {
    seedMe()
    await failingQuery(["orders", "list", status], status)
    assert.equal(meIsStale(), false, `status ${status}`)
  }
})

test("a 403 of «who am I» itself does not ask again", async () => {
  queryClient.clear()
  let asked = 0
  await queryClient
    .fetchQuery({
      queryKey: ME_QUERY_KEY,
      queryFn: () => {
        asked += 1
        return Promise.reject(refusal(403))
      },
      retry: false,
    })
    .catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(asked, 1)
})

test("the hook, the route guard and the reset share one key, and the guard reads a thrown-away answer again", () => {
  const users = read("hooks/api/users.tsx")
  assert.match(users, /me: \(\) => \[\.\.\.ME_QUERY_KEY\]/)

  const guard = read("lib/caller-may-open.ts")
  assert.match(guard, /queryClient\.fetchQuery\(meQueryOptions\(\)\)/)
  assert.doesNotMatch(guard, /ensureQueryData/, "the guard would keep deciding by the old role")

  const client = read("lib/query-client.ts")
  assert.match(client, /queryCache: new QueryCache\(\{\s*onError: \(error, query\) => refreshMeOnForbidden\(error, query\.queryKey\)/)
  assert.match(client, /mutationCache: new MutationCache\(\{\s*onError: \(error\) => refreshMeOnForbidden\(error\)/)
  assert.match(client, /invalidateQueries\(\{ queryKey: ME_QUERY_KEY \}\)/)
})

test("the screen says «Нет доступа» on a 403, not the general error", () => {
  const boundary = read("components/utilities/error-boundary/error-boundary.tsx")
  const forbidden = boundary.indexOf("error.status === 403")
  assert.notEqual(forbidden, -1, "the 403 branch is missing")
  assert.match(boundary.slice(forbidden, forbidden + 80), /return <NoAccess \/>/)
  assert.ok(
    forbidden < boundary.indexOf("let title: string"),
    "the 403 must be answered before the general error screen is built"
  )
  // The sidebar and the outlet draw from `useMe`, which reads the answer again.
  assert.match(read("hooks/use-permissions.tsx"), /const \{ user \} = useMe\(\)/)
})
