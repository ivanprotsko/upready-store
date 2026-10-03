// node --test scripts/__tests__/check-evidence-manifest.test.mjs
// Each case builds a throwaway git repository, commits a base, changes it and
// runs the real script against it with --root and --base.
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "check-evidence-manifest.mjs")
const task = "docs/evidence/t-demo"
const sha = (text) => createHash("sha256").update(text).digest("hex")

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), "evidence-check-"))
  const git = (...args) =>
    execFileSync(
      "git",
      ["-C", root, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args],
      { stdio: "pipe" },
    )
  const write = (rel, text) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), text)
  }
  git("init", "-q", "-b", "main")
  write(`${task}/shots/old.png`, "old bytes")
  write(`${task}/README.md`, "evidence")
  git("add", "-A")
  git("commit", "-q", "-m", "base")
  git("branch", "base")
  const run = () => spawnSync("node", [script, "--root", root, "--base", "base"], { encoding: "utf8" })
  const done = () => rmSync(root, { recursive: true, force: true })
  return { root, git, write, run, done }
}

const manifest = (entries) =>
  "# test manifest\n" +
  entries.map(([file, fields]) => `${file}:\n` + Object.entries(fields).map(([k, v]) => `  ${k}: ${v}\n`).join("")).join("")

test("no change under docs/evidence passes", () => {
  const r = repo()
  try {
    const out = r.run()
    assert.equal(out.status, 0, out.stderr)
    assert.match(out.stdout, /OK — 0 changed media file/)
  } finally {
    r.done()
  }
})

test("a new screenshot without a manifest fails, committed or untracked", () => {
  const r = repo()
  try {
    r.write(`${task}/shots/new.webp`, "new bytes")
    let out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /shots\/new\.webp: added, and docs\/evidence\/t-demo\/EVIDENCE\.yml does not exist/)
    r.git("add", "-A")
    r.git("commit", "-q", "-m", "new")
    out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /new\.webp: added/)
  } finally {
    r.done()
  }
})

test("a new screenshot from an anonymized database with a matching sha256 passes", () => {
  const r = repo()
  try {
    r.write(`${task}/shots/new.webp`, "new bytes")
    r.write(`${task}/EVIDENCE.yml`, manifest([["shots/new.webp", { source: "обезличенная база upready_store_anon_1", sha256: sha("new bytes") }]]))
    const out = r.run()
    assert.equal(out.status, 0, out.stderr)
    assert.match(out.stdout, /OK — 1 changed media file/)
  } finally {
    r.done()
  }
})

test("a new screenshot cannot enter as redacted", () => {
  const r = repo()
  try {
    r.write(`${task}/shots/new.webp`, "new bytes")
    r.write(
      `${task}/EVIDENCE.yml`,
      manifest([["shots/new.webp", { source: "копия боевой базы", redacted: "t-x, закрашено", sha256: sha("new bytes") }]]),
    )
    const out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /a new file must come from «обезличенная база <name>»/)
  } finally {
    r.done()
  }
})

test("a screenshot already in git may be redacted in place", () => {
  const r = repo()
  try {
    r.write(`${task}/shots/old.png`, "painted bytes")
    r.write(
      `${task}/EVIDENCE.yml`,
      manifest([["shots/old.png", { source: "копия боевой базы", redacted: "t-x, закрашены отзывы", sha256: sha("painted bytes") }]]),
    )
    const out = r.run()
    assert.equal(out.status, 0, out.stderr)
  } finally {
    r.done()
  }
})

test("a modified screenshot needs an entry, and a live source without redacted fails", () => {
  const r = repo()
  try {
    r.write(`${task}/shots/old.png`, "reshot bytes")
    let out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /old\.png: modified, and .*EVIDENCE\.yml does not exist/)
    r.write(`${task}/EVIDENCE.yml`, manifest([["shots/old.png", { source: "копия боевой базы", sha256: sha("reshot bytes") }]]))
    out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /not «обезличенная база <name>», and carries no redacted note/)
  } finally {
    r.done()
  }
})

test("bytes that differ from the declared sha256 fail, even for a file the change does not touch", () => {
  const r = repo()
  try {
    r.write(`${task}/EVIDENCE.yml`, manifest([["shots/old.png", { source: "обезличенная база db", sha256: sha("other bytes") }]]))
    const out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /old\.png: sha256 differs/)
  } finally {
    r.done()
  }
})

test("an entry for a missing file fails", () => {
  const r = repo()
  try {
    r.write(`${task}/EVIDENCE.yml`, manifest([["shots/gone.png", { source: "обезличенная база db", sha256: sha("x") }]]))
    const out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /gone\.png does not exist/)
  } finally {
    r.done()
  }
})

test("a deleted screenshot passes, its stale entry does not", () => {
  const r = repo()
  try {
    unlinkSync(path.join(r.root, `${task}/shots/old.png`))
    assert.equal(r.run().status, 0)
    r.write(`${task}/EVIDENCE.yml`, manifest([["shots/old.png", { source: "обезличенная база db", sha256: sha("old bytes") }]]))
    assert.equal(r.run().status, 1)
  } finally {
    r.done()
  }
})

test("a screenshot straight under docs/evidence fails, one outside it is not checked", () => {
  const r = repo()
  try {
    r.write("docs/evidence/loose.png", "x")
    let out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /loose\.png: put it under docs\/evidence\/<task>\//)
    unlinkSync(path.join(r.root, "docs/evidence/loose.png"))
    r.write("docs/other/shot.png", "x")
    r.write(`${task}/notes.md`, "text is not media")
    out = r.run()
    assert.equal(out.status, 0, out.stderr)
  } finally {
    r.done()
  }
})

test("a manifest outside the strict format fails with its line", () => {
  const r = repo()
  try {
    r.write(`${task}/shots/new.webp`, "new bytes")
    r.write(`${task}/EVIDENCE.yml`, `shots/new.webp:\n    source: обезличенная база db\n  sha256: ${sha("new bytes")}\n  colour: red\n`)
    const out = r.run()
    assert.equal(out.status, 1)
    assert.match(out.stderr, /EVIDENCE\.yml:2: expected/)
    assert.match(out.stderr, /EVIDENCE\.yml:4: unknown key "colour"/)
  } finally {
    r.done()
  }
})

test("an unknown base is refused", () => {
  const r = repo()
  try {
    const out = spawnSync("node", [script, "--root", r.root, "--base", "no-such-ref"], { encoding: "utf8" })
    assert.equal(out.status, 1)
    assert.match(out.stderr, /base "no-such-ref" is not a commit here/)
  } finally {
    r.done()
  }
})
