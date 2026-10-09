import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The owner guide (docs/owner-guide) shows a frame of a panel screen for every
 * step, and each frame names the files that draw it. A screen that moves or is
 * renamed leaves the guide pointing at nothing, which nobody notices until the
 * next shoot. This test runs the guide's own structure check. Every scene's
 * sources exist, every frame a page shows is a scene with its file in git,
 * every scene is shown.
 *
 * Whether the frames are FRESH is not asserted here: refreshing them needs a
 * stand, so a stale frame is reported by the «Owner guide» step of pr-checks.yml
 * (check.mjs --warn) instead of failing every panel change.
 */
const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
const guide = join(repo, "docs/owner-guide")
const { forbiddenIn } = await import(join(guide, "lib.mjs"))

test("the owner guide's scenes, sources and frame references hold together", () => {
  const run = spawnSync(process.execPath, [join(guide, "check.mjs"), "--structure"], { encoding: "utf8" })
  assert.equal(run.status, 0, run.stdout + run.stderr)
})

/**
 * t-2026-10-09-103: the frames are in git and the panel serves them at /help/,
 * so no frame may show a real person of the shop or a work mail. shoot.mjs
 * refuses such a screen and writes what every frame shows into
 * shots.lock.json; this looks there once more, so a frame replaced by hand or
 * shot by an older script cannot slip through. check.mjs makes sure the file
 * in git is the one the lock describes.
 */
test("no frame of the owner guide shows a real person or a work mail", () => {
  const lock = JSON.parse(readFileSync(join(guide, "shots.lock.json"), "utf8"))
  const scenes = Object.entries(lock.scenes)
  assert.ok(scenes.length > 0, "shots.lock.json has no frames")
  for (const [id, rec] of scenes) {
    assert.ok(typeof rec.text === "string" && rec.text.length > 0, `${id}: the lock has no text of the frame, shoot it again`)
    assert.deepEqual(forbiddenIn(rec.text), [], `${id}: the frame shows a real person or a work mail`)
  }
})

// The surnames are hashed in lib.mjs, so the check is exercised here on a
// made-up one and on what must pass, the shop's own name.
test("the name check catches a surname in any form and a work mail, and lets the shop's name through", () => {
  const stem = "примеров"
  const stems = [{ len: stem.length, sha: createHash("sha256").update(stem).digest("hex").slice(0, 16) }]
  assert.deepEqual(forbiddenIn("Владелица Примерова", stems), ["фамилия человека магазина"])
  assert.deepEqual(forbiddenIn("ПРИМЕРОВУ", stems), ["фамилия человека магазина"])
  assert.deepEqual(forbiddenIn("Менеджер Анна, manager1@example.ru", stems), [])
  assert.deepEqual(forbiddenIn("Магазин Черкашино, cherkashino.ru"), [])
  assert.deepEqual(forbiddenIn("почта anna@cherkashino.ru"), ["рабочая почта магазина"])
})
