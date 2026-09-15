/**
 * The registry's own gate. Three things are checked here and nowhere else:
 * that the CLI's parts behave, that every entry in registry.json points at
 * something real, and that the baseline can hide a known finding without ever
 * hiding a new one.
 *
 *   node --test tools/test-methods/__tests__/
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import { parseArgs, isKnown, scoreSymptom, loadRegistry, runMethod, sameFile } from "../tm.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const registry = loadRegistry();

test("parseArgs separates flags from positionals and treats a bare flag as true", () => {
  const { flags, positional } = parseArgs(["run", "tm-001", "--base", "abc123", "--strict", "--json"]);
  assert.deepEqual(positional, ["run", "tm-001"]);
  assert.equal(flags.base, "abc123");
  assert.equal(flags.strict, true);
  assert.equal(flags.json, true);
});

test("parseArgs keeps a value that looks like prose", () => {
  const { flags } = parseArgs(["match", "--symptom", "картинка сохраняется, а витрина её не показывает"]);
  assert.equal(flags.symptom, "картинка сохраняется, а витрина её не показывает");
});

test("isKnown matches on the fields the baseline entry names and ignores the rest", () => {
  const baseline = [{ check: "written-never-read", key: "language", reason: "…", task: "t", since: "2026-09-15" }];
  assert.ok(isKnown({ check: "written-never-read", key: "language", file: "a.tsx", line: 61 }, baseline));
  // A different line is the same finding; a different key is not.
  assert.ok(isKnown({ check: "written-never-read", key: "language", file: "a.tsx", line: 900 }, baseline));
  assert.equal(isKnown({ check: "written-never-read", key: "badge_text", file: "a.tsx", line: 61 }, baseline), undefined);
  assert.equal(isKnown({ check: "owner-data-loses-to-build-defaults", key: "language" }, baseline), undefined);
});

test("scoreSymptom finds the method behind a complaint written in the owner's words", () => {
  const byId = Object.fromEntries(registry.methods.map((m) => [m.id, m]));
  const image = scoreSymptom(byId["tm-002"], "загрузила картинку категории, сохранилось, а на витрине её нигде нет");
  const boot = scoreSymptom(byId["tm-001"], "контейнер падает при старте, Cannot find module");
  assert.ok(image.score > 0, "tm-002 should match the picture complaint");
  assert.ok(boot.score > 0, "tm-001 should match the boot crash");
  assert.equal(scoreSymptom(byId["tm-003"], "кот сидит на клавиатуре").score, 0);
});

test("every registry entry points at a detector that exists and exports run()", async () => {
  for (const method of registry.methods) {
    const file = path.join(ROOT, method.detector.module);
    assert.ok(fs.existsSync(file), `${method.id}: ${method.detector.module} is missing`);
    const detector = await import(pathToFileURL(file).href);
    assert.equal(typeof detector.run, "function", `${method.id}: detector exports no run()`);
    assert.equal(detector.id, method.id, `${method.id}: detector id disagrees with the registry`);
  }
});

test("every registry entry carries the fields the schema promises", () => {
  for (const method of registry.methods) {
    for (const field of ["id", "bugClass", "symptom", "keywords", "detector", "scope", "placement", "fixtures", "evidence"]) {
      assert.ok(method[field], `${method.id}: no ${field}`);
    }
    assert.ok(["static", "build", "runtime"].includes(method.detector.kind), `${method.id}: unknown detector kind`);
    assert.ok(
      ["before-task", "acceptance", "after-deploy"].includes(method.placement),
      `${method.id}: unknown placement ${method.placement}`
    );
    assert.ok(method.scope.paths.length, `${method.id}: scope.paths is empty, nothing to materialise`);
    assert.ok(method.evidence.redOn.length, `${method.id}: no commit where the detector is red`);
    assert.ok(method.evidence.greenOn.length, `${method.id}: no commit where the detector is green`);
  }
});

test("every fixture directory named in the registry exists", () => {
  for (const method of registry.methods) {
    for (const variant of method.fixtures.variants ?? []) {
      assert.ok(fs.existsSync(path.join(ROOT, variant.dir)), `${method.id}: ${variant.dir} is missing`);
    }
    assert.ok(
      (method.fixtures.variants ?? []).some((v) => v.expect === "green"),
      `${method.id}: no green fixture, so nothing proves the detector can stay quiet`
    );
    assert.ok(
      (method.fixtures.variants ?? []).filter((v) => v.expect === "red").length >= 2,
      `${method.id}: fewer than two red variants, so one accident could be passing for a class`
    );
  }
});

test("every commit the evidence names resolves in this repository", () => {
  for (const method of registry.methods) {
    const shas = [
      method.fixtures.original.sha,
      ...method.evidence.redOn.map((c) => c.sha),
      ...method.evidence.greenOn.map((c) => c.sha),
    ];
    for (const sha of shas) {
      const resolved = execFileSync("git", ["rev-parse", "--verify", `${sha}^{commit}`], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();
      assert.equal(resolved, sha, `${method.id}: ${sha} is not a full commit id`);
    }
  }
});

test("every baseline entry names a reason and the task that owns it", () => {
  for (const method of registry.methods) {
    for (const entry of method.baseline ?? []) {
      assert.ok(entry.check, `${method.id}: a baseline entry with no check`);
      assert.ok(entry.reason && entry.reason.length > 40, `${method.id}: a baseline entry with no real reason`);
      assert.ok(entry.task, `${method.id}: a baseline entry nobody owns`);
    }
  }
});

test("the baseline hides exactly the finding it names and nothing else", async () => {
  const method = registry.methods.find((m) => m.id === "tm-003");
  const fixture = path.join(ROOT, "fixtures/tm-003/variant-1-name-only");

  const strict = await runMethod(method, { root: fixture, strict: true });
  assert.equal(strict.status, "red");
  assert.equal(strict.findings.length, 1);

  // A baseline written for THIS finding turns the same run green and keeps the
  // finding visible under `known`.
  const patched = {
    ...method,
    baseline: [
      {
        check: "fixture-named-file-in-compiled-tree",
        file: "apps/backend/src/scripts/q05-seed-test-orders.ts",
        reason: "fixture for the baseline test itself, long enough to pass the reason gate",
        task: "unit-test",
      },
    ],
  };
  const relaxed = await runMethod(patched, { root: fixture });
  assert.equal(relaxed.status, "green");
  assert.equal(relaxed.findings.length, 0);
  assert.equal(relaxed.known.length, 1);
  assert.equal(relaxed.known[0].known.task, "unit-test");

  // A baseline for a NEIGHBOURING file hides nothing.
  const wrong = { ...method, baseline: [{ ...patched.baseline[0], file: "apps/backend/src/scripts/other.ts" }] };
  const stillRed = await runMethod(wrong, { root: fixture });
  assert.equal(stillRed.status, "red");
});

test("a baseline entry that no longer matches anything is RED, not silence", async () => {
  const method = registry.methods.find((m) => m.id === "tm-003");
  const fixture = path.join(ROOT, "fixtures/tm-003/green");

  // The green fixture holds nothing this method finds, so a baseline entry
  // written for it is by definition stale — this is what a paid-off debt looks
  // like after the fix lands and the entry stays behind.
  const withDebt = {
    ...method,
    baseline: [
      {
        check: "fixture-marker-in-compiled-tree",
        file: "apps/backend/src/scripts/already-moved.ts",
        reason: "debt that has already been paid, entry left behind — long enough for the reason gate",
        task: "some-task",
      },
    ],
  };

  const quiet = await runMethod(withDebt, { root: fixture });
  assert.equal(quiet.status, "green", "without checkStale the entry is simply unused");
  assert.equal(quiet.stale.length, 0);

  const checked = await runMethod(withDebt, { root: fixture, checkStale: true });
  assert.equal(checked.status, "red", "a stale entry has to fail the run");
  assert.equal(checked.findings.length, 0, "and it is not a finding, it is a rotten excuse");
  assert.equal(checked.stale.length, 1);
  assert.equal(checked.stale[0].task, "some-task");
});

test("a baseline entry that still matches is not stale", async () => {
  const method = registry.methods.find((m) => m.id === "tm-003");
  const fixture = path.join(ROOT, "fixtures/tm-003/variant-1-name-only");
  const live = {
    ...method,
    baseline: [
      {
        check: "fixture-named-file-in-compiled-tree",
        file: "apps/backend/src/scripts/q05-seed-test-orders.ts",
        reason: "a debt that is still standing, reason long enough for the gate above",
        task: "some-task",
      },
    ],
  };
  const result = await runMethod(live, { root: fixture, checkStale: true });
  assert.equal(result.status, "green");
  assert.equal(result.known.length, 1);
  assert.equal(result.stale.length, 0);
});

test("--strict and --base report zero stale, whatever they find", () => {
  const cli = path.join(ROOT, "tm.mjs");
  const stale = (output) => {
    const row = output.split("\n").find((line) => line.startsWith("tm-003"));
    assert.ok(row, `no tm-003 row in:\n${output}`);
    // ID  STATUS  NEW  KNOWN  STALE  SCANNED
    return Number(row.trim().split(/\s+/)[4]);
  };

  // --strict empties the baseline, so there is nothing there to go stale. The
  // assertion is on the STALE column rather than on the exit code: what this
  // repository happens to contain today is not the behaviour under test, and
  // the first version of this test broke the moment the findings were fixed.
  let strict;
  try {
    strict = execFileSync(
      process.execPath,
      [cli, "run", "tm-003", "--root", path.join(ROOT, "fixtures/tm-003/variant-1-name-only"), "--strict"],
      { encoding: "utf8" }
    );
  } catch (error) {
    strict = error.stdout;
    assert.equal(error.status, 1, "a fixture carrying the class must exit 1");
  }
  assert.match(strict, /RED/);
  assert.equal(stale(strict), 0);

  // --base replays an old commit: its entries are unmatched by construction and
  // that is history, not rot.
  const historic = execFileSync(process.execPath, [cli, "run", "tm-003", "--base", "5b6e9e2"], { encoding: "utf8" });
  assert.match(historic, /GREEN/);
  assert.equal(stale(historic), 0);
});

test("the CLI runs through a symlinked path instead of printing nothing", () => {
  // `/tmp` is a symlink to `/private/tmp` on macOS, so comparing path SPELLINGS
  // to decide whether this module is the program made the CLI exit 0 with an
  // empty output — indistinguishable from "nothing to report" (rule 20a).
  const link = path.join(os.tmpdir(), `tm-entrypoint-${process.pid}`);
  fs.rmSync(link, { force: true });
  fs.symlinkSync(ROOT, link, "dir");
  try {
    const out = execFileSync(process.execPath, [path.join(link, "tm.mjs"), "list"], { encoding: "utf8" });
    assert.match(out, /tm-001/, "the listing has to print through a symlinked path too");
  } finally {
    fs.rmSync(link, { force: true });
  }
});

test("sameFile compares files, not spellings of a path", () => {
  // This is the fallback the entry-point check uses on Node 20 and 22, where
  // `import.meta.main` does not exist, so it is tested directly.
  const link = path.join(os.tmpdir(), `tm-samefile-${process.pid}`);
  fs.rmSync(link, { force: true });
  fs.symlinkSync(ROOT, link, "dir");
  try {
    const viaLink = path.join(link, "tm.mjs");
    const direct = path.join(ROOT, "tm.mjs");
    assert.notEqual(viaLink, direct, "the two spellings must really differ");
    assert.ok(sameFile(viaLink, direct), "the same file under two spellings is the same file");
    assert.ok(!sameFile(direct, path.join(ROOT, "registry.json")), "two different files are not");
    // A path that does not exist cannot be resolved and must not throw.
    assert.ok(!sameFile(direct, path.join(ROOT, "no-such-file.mjs")));
  } finally {
    fs.rmSync(link, { force: true });
  }
});

test("the CLI exits non-zero on a red run and zero on a green one", () => {
  const cli = path.join(ROOT, "tm.mjs");
  const strictRun = () =>
    execFileSync(process.execPath, [cli, "run", "tm-003", "--root", path.join(ROOT, "fixtures/tm-003/variant-1-name-only"), "--strict"], {
      encoding: "utf8",
    });
  assert.throws(strictRun, (error) => error.status === 1, "a red run must exit 1");

  const green = execFileSync(
    process.execPath,
    [cli, "run", "tm-003", "--root", path.join(ROOT, "fixtures/tm-003/green")],
    { encoding: "utf8" }
  );
  assert.match(green, /GREEN/);
});
