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
const { brandProblems, customerMarks, forbiddenIn, readBrands } = await import(join(guide, "lib.mjs"))

test("the owner guide's scenes, sources and frame references hold together", () => {
  const run = spawnSync(process.execPath, [join(guide, "check.mjs"), "--structure"], { encoding: "utf8" })
  assert.equal(run.status, 0, run.stdout + run.stderr)
})

/**
 * t-2026-10-09-103: the frames are in git and the panel serves them at /help/,
 * so no frame may show a real person of the shop or a work mail. Since
 * t-2026-10-09-104 every customer reads the same frames under their own logo,
 * so no frame may name a customer either, whether by the name in the panel's
 * header, an address, or a handle or SKU with the customer's domain. shoot.mjs
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
    assert.deepEqual(forbiddenIn(rec.text), [], `${id}: the frame shows a real person, a work mail or a customer`)
  }
})

// The surnames are hashed in lib.mjs, so the check is exercised here on a
// made-up one; the customers come from brands.json.
test("the name check catches a surname in any form, a work mail and a customer, and lets the demo shop through", () => {
  const stem = "примеров"
  const stems = [{ len: stem.length, sha: createHash("sha256").update(stem).digest("hex").slice(0, 16) }]
  assert.deepEqual(forbiddenIn("Владелица Примерова", stems), ["фамилия человека магазина"])
  assert.deepEqual(forbiddenIn("ПРИМЕРОВУ", stems), ["фамилия человека магазина"])
  assert.deepEqual(forbiddenIn("Менеджер Анна, manager1@example.ru", stems), [])
  assert.deepEqual(forbiddenIn("Демо-магазин, demo-shop.example, Артикул 291156821-DEMO, Upready Store"), [])
  // The shop is named after a person, so its name may also read as a surname; the customer is what counts here.
  const has = (text, finding) => assert.ok(forbiddenIn(text).includes(finding), `${text}: ${forbiddenIn(text).join("; ")}`)
  has("Ч\nЧеркашино\nПоиск", "название магазина-заказчика «черкашино»")
  has("https://api.cherkashino.ru/static/a.webp", "адрес или код магазина-заказчика «cherkashino»")
  has("Артикул 291156821-CHERKASHINO", "адрес или код магазина-заказчика «cherkashino»")
  has("почта anna@cherkashino.ru", "рабочая почта магазина")
})

// t-2026-10-09-104: one table names the brand of every docs host and panel
// host. A row a new customer gets keeps that customer off the frames with no
// other change, and the platform's own name and hosts stay allowed.
test("the brands table holds together and every customer in it is kept off the frames", () => {
  const brands = readBrands()
  assert.deepEqual(brandProblems(brands), [])
  assert.equal(brands.default.name, "Upready Store")
  assert.equal(brands.hosts["docs.upready.dev"].name, "Upready Store")
  const marks = customerMarks(brands)
  for (const [host, b] of Object.entries(brands.hosts)) {
    const found = forbiddenIn(`${b.name} ${host}`)
    if (b.name === brands.default.name) assert.deepEqual(found, [], `${host}: the platform's own brand is allowed`)
    else assert.ok(found.length > 0, `${host}: a customer's name and host must be kept off the frames`)
  }
  assert.ok(!marks.labels.includes("upready") && !marks.names.includes("upready"))
  const extra = customerMarks({ default: brands.default, hosts: { "docs.romashka.ru": { name: "Ромашка", logo: "brands/x.svg" } } })
  assert.deepEqual(extra, { names: ["ромашка"], labels: ["romashka"] })
})
