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
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import { parseArgs, isKnown, scoreSymptom, loadRegistry, runMethod } from "../tm.mjs";

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
