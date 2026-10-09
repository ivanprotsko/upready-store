import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The owner guide (docs/owner-guide) shows a frame of a panel screen for every
 * step, and each frame names the files that draw it. A screen that moves or is
 * renamed leaves the guide pointing at nothing, which nobody notices until the
 * next shoot. This test runs the guide's own structure check: every scene's
 * sources exist, every frame a page shows is a scene, every scene is shown.
 *
 * Whether the frames are FRESH is not asserted here: refreshing them needs a
 * stand, so a stale frame is reported by the «Owner guide» step of pr-checks.yml
 * (check.mjs --warn) instead of failing every panel change.
 */
const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")

test("the owner guide's scenes, sources and frame references hold together", () => {
  const run = spawnSync(process.execPath, [join(repo, "docs/owner-guide/check.mjs"), "--structure"], { encoding: "utf8" })
  assert.equal(run.status, 0, run.stdout + run.stderr)
})
