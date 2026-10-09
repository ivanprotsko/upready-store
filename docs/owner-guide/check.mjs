#!/usr/bin/env node
// Finds the owner guide frames that no longer match the panel.
//
//   node docs/owner-guide/check.mjs                 # stale frames and broken references, exit 1 if any
//   node docs/owner-guide/check.mjs --structure     # only what needs no stand: scenes, sources, references, frame files, brands.json
//   node docs/owner-guide/check.mjs --warn          # print the same, exit 0 (pr-checks.yml)
//
// A frame is stale when, since it was shot,
//   - the code that draws it changed (the scene's `sources` plus the menu), or
//   - a Russian string it shows changed (the scene's `i18n` prefixes in ru.json).
// For each stale frame the check names the changed files (git diff against the commit of the shoot) and
// the changed strings. What the hashes cannot see (data, styles from a shared package, a dependency update)
// is caught by comparing pixels: shoot.mjs --compare <published frames>.
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { SCENES } from "./scenes.mjs"
import { LOCK, REPO, RU, SHOTS_DIR, brandProblems, flatten, hashSources, hashStrings, imageRefs, parseArgs, pickStrings, readCatalog, sceneI18n, sceneSources, sha256File } from "./lib.mjs"

const args = parseArgs(process.argv.slice(2), { structure: "flag", warn: "flag" })
const problems = []
const say = (line) => problems.push(line)

// 1. Scenes: ids are unique, every source exists.
const seen = new Set()
for (const s of SCENES) {
  if (seen.has(s.id)) say(`сцена ${s.id} записана дважды`)
  seen.add(s.id)
  for (const p of sceneSources(s)) if (!existsSync(join(REPO, p))) say(`сцена ${s.id}: нет файла или папки ${p} — экран переехал, поправьте sources в scenes.mjs`)
}

// 2. References: every frame a guide page shows is a scene; a scene no page shows is reported too.
const refs = imageRefs()
for (const { page, id } of refs) if (!seen.has(id)) say(`guide/${page}: кадр ${id} не описан в scenes.mjs`)
const used = new Set(refs.map((r) => r.id))
for (const s of SCENES) if (!used.has(s.id)) say(`сцена ${s.id} не показана ни на одной странице guide/`)

// 3. Frame files. They are in git (guide/shots) and the panel image builds the help from them, so a missing file
// would break that build. A file must be the one shoot.mjs wrote, whose hash is in the lock together with the text
// the panel test checks for real people's names. A frame no page shows only adds weight.
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : null
for (const id of used) {
  const file = join(SHOTS_DIR, `${id}.webp`)
  if (!existsSync(file)) say(`нет файла кадра guide/shots/${id}.webp`)
  else if (lock?.scenes?.[id] && lock.scenes[id].frame !== sha256File(file)) say(`кадр ${id}: файл не тот, что снял shoot.mjs (хеш не совпадает с shots.lock.json)`)
}
for (const f of existsSync(SHOTS_DIR) ? readdirSync(SHOTS_DIR) : []) {
  if (!used.has(f.replace(/\.webp$/, ""))) say(`guide/shots/${f}: кадр не показан ни на одной странице`)
}

// 4. The brands table. publish.mjs builds every brand's logo into the help, so a broken row would break the panel image.
for (const p of brandProblems()) say(p)

// 5. Freshness against the lock.
if (!args.structure) {
  if (!lock) say("нет shots.lock.json: кадры ни разу не снимали (shoot.mjs)")
  else {
    const catalog = readCatalog()
    const git = (...a) => {
      try {
        return execFileSync("git", a, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
      } catch {
        return null
      }
    }
    const oldRu = git("show", `${lock.commit}:${RU}`)
    const oldCatalog = oldRu ? flatten(JSON.parse(oldRu)) : null
    for (const s of SCENES) {
      const rec = lock.scenes?.[s.id]
      if (!rec) {
        say(`кадр ${s.id} не снят`)
        continue
      }
      if (hashSources(sceneSources(s)) !== rec.sources) {
        const files = git("diff", "--name-only", lock.commit, "--", ...sceneSources(s))
        say(`кадр ${s.id} устарел: изменился код экрана${files ? ` (${files.split("\n").join(", ")})` : ""}`)
      }
      if (hashStrings(catalog, sceneI18n(s)) !== rec.i18n) {
        let keys = ""
        if (oldCatalog) {
          const now = pickStrings(catalog, sceneI18n(s))
          const then = pickStrings(oldCatalog, sceneI18n(s))
          const changed = [...new Set([...Object.keys(now), ...Object.keys(then)])].filter((k) => now[k] !== then[k])
          keys = ` (${changed.slice(0, 8).join(", ")}${changed.length > 8 ? ` и ещё ${changed.length - 8}` : ""})`
        }
        say(`кадр ${s.id} устарел: изменились тексты${keys}`)
      }
      if (rec.path !== s.path || rec.role !== s.role) say(`кадр ${s.id} устарел: сцена теперь снимает ${s.role ?? "без входа"} ${s.path}`)
    }
  }
}

if (problems.length === 0) {
  console.log(`owner-guide: ${SCENES.length} кадров, ${refs.length} ссылок на кадры в guide/, всё свежее`)
  process.exit(0)
}
for (const p of problems) console.log(`owner-guide: ${p}`)
console.log(`\nНайдено: ${problems.length}. Как обновить: docs/owner-guide/README.md, раздел «Когда панель изменилась».`)
process.exit(args.warn ? 0 : 1)
