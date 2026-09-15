#!/usr/bin/env node
/**
 * tm — the test-method registry's command line.
 *
 * A bug found once is worth a method that finds its whole class everywhere,
 * for ever. This file is the runner for that registry: it lists the methods,
 * matches a fresh symptom against them, runs their detectors against the
 * working tree or any commit, and replays each method's recorded evidence so
 * that a detector which has quietly stopped working cannot keep claiming a
 * clean bill of health.
 *
 *   node tools/test-methods/tm.mjs list
 *   node tools/test-methods/tm.mjs match --symptom "картинка сохраняется, а на витрине её нет"
 *   node tools/test-methods/tm.mjs run all
 *   node tools/test-methods/tm.mjs run tm-001 --base 74d9c01
 *   node tools/test-methods/tm.mjs verify all
 *
 * Exit code is 1 whenever something is red, so the whole thing drops into an
 * acceptance step or a CI job without any wrapper.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { materialize, cleanup, repoRoot } from "./lib/tree.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = path.join(HERE, "registry.json");

export function loadRegistry(file = REGISTRY) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function methodsOf(registry, selector) {
  if (!selector || selector === "all") return registry.methods;
  const picked = registry.methods.filter((m) => m.id === selector || m.slug === selector);
  if (!picked.length) {
    throw new Error(`no method "${selector}" in the registry; try: ${registry.methods.map((m) => m.id).join(", ")}`);
  }
  return picked;
}

async function detectorOf(method) {
  return import(pathToFileURL(path.join(HERE, method.detector.module)).href);
}

/**
 * A finding matches a baseline entry when every field the entry names is equal.
 * An entry names as little as it needs to, so a known finding stays recognised
 * when its line number moves, and a NEW finding in the same file is still new.
 */
export function isKnown(finding, baseline = []) {
  return baseline.find((entry) =>
    Object.entries(entry)
      .filter(([field]) => !["reason", "task", "since"].includes(field))
      .every(([field, value]) => finding[field] === value)
  );
}

/**
 * `checkStale` asks whether the baseline still describes reality.
 *
 * A baseline entry is a debt with an owner. When the debt is paid — the fixture
 * moves out of the compiled tree, the unread key gets a reader — the entry stops
 * matching anything and turns into an excuse with no subject. Left in place it is
 * a live hole in the gate: the next occurrence of the same finding is waved
 * through by a line nobody remembers writing, and the `known` list only ever
 * grows. So a stale entry is RED, and the cure is deleting it.
 *
 * The check runs against THIS REPOSITORY'S OWN WORKING TREE only. A baseline is
 * a statement about that tree as it stands today, so any other root leaves its
 * entries unmatched by construction and must not be called rot for it: `--base`
 * replays an old commit (`run tm-003 --base 5b6e9e2` demonstrates a clean tree
 * and has to stay green) and `--root` points at a fixture. `--strict` empties
 * the baseline, so there is nothing there to go stale either. Measured the hard
 * way: the first version checked `--base` alone, and the CLI's own test — a run
 * against the green fixture with `--root` — went red on three entries that were
 * perfectly alive in the repository.
 */
export async function runMethod(method, { root, strict = false, checkStale = false } = {}) {
  const detector = await detectorOf(method);
  const result = detector.run(root, method.config ?? {});
  const baseline = strict ? [] : method.baseline ?? [];
  const findings = [];
  const known = [];
  const matched = new Set();

  for (const finding of result.findings ?? []) {
    const entry = isKnown(finding, baseline);
    if (entry) {
      known.push({ ...finding, known: entry });
      matched.add(entry);
    } else findings.push(finding);
  }

  const stale = checkStale && result.status !== "skipped" ? baseline.filter((entry) => !matched.has(entry)) : [];

  const status =
    result.status === "skipped" ? "skipped" : findings.length || stale.length ? "red" : "green";
  return { ...result, status, findings, known, stale };
}

/* ------------------------------------------------------------------ output */

function pad(value, width) {
  const text = String(value ?? "");
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function table(rows, columns) {
  const widths = columns.map((col) =>
    Math.max(col.title.length, ...rows.map((row) => String(row[col.key] ?? "").length))
  );
  const line = columns.map((col, i) => pad(col.title, widths[i])).join("  ");
  const rule = widths.map((w) => "-".repeat(w)).join("  ");
  const body = rows.map((row) => columns.map((col, i) => pad(row[col.key], widths[i])).join("  "));
  return [line, rule, ...body].join("\n");
}

const MARK = { green: "GREEN", red: "RED", skipped: "SKIP", mismatch: "FAIL" };

/** A note trimmed to what still fits a terminal row; the registry keeps the whole of it. */
function short(note, width = 58) {
  if (!note) return "";
  return note.length <= width ? note : `${note.slice(0, width - 1)}…`;
}

/* ---------------------------------------------------------------- commands */

function cmdList(registry, flags) {
  if (flags.json) {
    console.log(JSON.stringify(registry.methods.map(({ id, bugClass, symptom, placement, detector, scope }) => ({ id, bugClass, symptom, placement, kind: detector.kind, scope })), null, 2));
    return 0;
  }
  console.log(
    table(
      registry.methods.map((m) => ({
        id: m.id,
        kind: m.detector.kind,
        placement: m.placement,
        bugClass: m.bugClass,
        from: m.fixtures.original.task,
      })),
      [
        { key: "id", title: "ID" },
        { key: "kind", title: "KIND" },
        { key: "placement", title: "WHEN" },
        { key: "from", title: "FROM BUG" },
        { key: "bugClass", title: "CLASS" },
      ]
    )
  );
  return 0;
}

/**
 * Score a free-text symptom against each method. Both the registry's keywords
 * and the method's own symptom text count, and the match is on word stems long
 * enough to mean something, so "картинку сохранил, на витрине нет" reaches the
 * method whose symptom says "картинка сохраняется, витрина её не показывает".
 */
export function scoreSymptom(method, symptom) {
  const text = symptom.toLowerCase();
  const words = new Set(text.split(/[^\p{L}\p{N}_-]+/u).filter((w) => w.length >= 4));
  let score = 0;
  const hits = [];

  for (const keyword of method.keywords ?? []) {
    const key = keyword.toLowerCase();
    if (text.includes(key)) {
      score += 3;
      hits.push(keyword);
      continue;
    }
    for (const word of words) {
      if (key.length >= 4 && (key.startsWith(word.slice(0, 5)) || word.startsWith(key.slice(0, 5)))) {
        score += 1;
        hits.push(`${keyword}~${word}`);
        break;
      }
    }
  }

  return { score, hits: [...new Set(hits)] };
}

function cmdMatch(registry, flags) {
  const symptom = flags.symptom;
  if (!symptom) {
    console.error('usage: tm.mjs match --symptom "<текст жалобы>"');
    return 2;
  }
  const scored = registry.methods
    .map((m) => ({ method: m, ...scoreSymptom(m, symptom) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (flags.json) {
    console.log(JSON.stringify(scored.map((e) => ({ id: e.method.id, score: e.score, hits: e.hits, cmd: e.method.detector.cmd })), null, 2));
    return scored.length ? 0 : 1;
  }

  if (!scored.length) {
    console.log(`no method matches "${symptom}".`);
    console.log("That is the signal to write one: README.md, «Как добавить метод».");
    return 1;
  }

  console.log(
    table(
      scored.map((e) => ({ id: e.method.id, score: e.score, cmd: e.method.detector.cmd, hits: e.hits.slice(0, 5).join(", ") })),
      [
        { key: "id", title: "ID" },
        { key: "score", title: "SCORE" },
        { key: "hits", title: "MATCHED ON" },
        { key: "cmd", title: "RUN" },
      ]
    )
  );
  return 0;
}

async function cmdRun(registry, selector, flags) {
  const methods = methodsOf(registry, selector);
  const results = [];
  let red = 0;

  for (const method of methods) {
    let root = flags.root ? path.resolve(flags.root) : repoRoot();
    let temp = null;
    let sha = null;

    if (flags.base) {
      const made = materialize(flags.base, method.scope.paths);
      temp = made.dir;
      root = made.dir;
      sha = made.sha;
    }

    try {
      const result = await runMethod(method, {
        root,
        strict: flags.strict,
        checkStale: !flags.base && !flags.root && !flags.strict,
      });
      if (result.status === "red") red += 1;
      results.push({ id: method.id, sha, root, ...result });
    } finally {
      if (temp) cleanup(temp);
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({ base: flags.base ?? null, strict: Boolean(flags.strict), results }, null, 2));
    return red ? 1 : 0;
  }

  console.log(
    table(
      results.map((r) => ({
        id: r.id,
        status: MARK[r.status],
        findings: r.findings.length,
        known: r.known.length,
        stale: r.stale.length,
        scanned: Object.entries(r.checked ?? {})
          .filter(([, v]) => typeof v === "number")
          .map(([k, v]) => `${k}=${v}`)
          .join(" "),
      })),
      [
        { key: "id", title: "ID" },
        { key: "status", title: "STATUS" },
        { key: "findings", title: "NEW" },
        { key: "known", title: "KNOWN" },
        { key: "stale", title: "STALE" },
        { key: "scanned", title: "SCANNED" },
      ]
    )
  );

  for (const r of results) {
    for (const f of r.findings) {
      console.log(`\n  RED  ${r.id}/${f.check}  ${f.file}:${f.line}`);
      console.log(`       ${f.message}`);
      if (f.evidence) console.log(`       evidence: ${f.evidence}`);
    }
    for (const f of r.known) {
      console.log(`\n  known ${r.id}/${f.check}  ${f.file}:${f.line}  (${f.known.task ?? "no task"})`);
      console.log(`       ${f.known.reason}`);
    }
    for (const entry of r.stale) {
      const what = [entry.check, entry.file, entry.key, entry.package].filter(Boolean).join("  ");
      console.log(`\n  STALE ${r.id}  ${what}`);
      console.log(`       эта запись baseline больше ничего не находит: долг закрыт, а запись осталась`);
      console.log(`       и теперь молча простит следующую такую же находку. Удалите её из`);
      console.log(`       registry.json (метод ${r.id}, baseline). Владелец записи: ${entry.task ?? "не указан"}.`);
    }
    if (r.status === "skipped") console.log(`\n  SKIP ${r.id}: ${r.reason}`);
  }

  if (flags.base) console.log(`\nmeasured against ${flags.base} (${results[0]?.sha ?? "?"}), the working tree untouched.`);
  return red ? 1 : 0;
}

/**
 * Replay a method's recorded evidence. A detector earns its place by being red
 * on the commit its bug was found in and green on the commit that fixed it,
 * and by staying that way: a registry whose evidence is a paragraph nobody
 * re-runs is a registry that will quietly rot. Fixtures are trees on disk,
 * commits are materialised with `git archive`, and the working tree is never
 * touched by either.
 */
async function cmdVerify(registry, selector, flags) {
  const methods = methodsOf(registry, selector);
  const rows = [];
  let failed = 0;

  for (const method of methods) {
    const cases = [
      ...(method.evidence.redOn ?? []).map((c) => ({ ...c, expect: "red", kind: "commit" })),
      ...(method.evidence.greenOn ?? []).map((c) => ({ ...c, expect: "green", kind: "commit" })),
      ...(method.fixtures.variants ?? []).map((v) => ({ ...v, kind: "fixture" })),
    ];

    for (const testCase of cases) {
      let root;
      let temp = null;
      let label;

      if (testCase.kind === "commit") {
        const made = materialize(testCase.sha, method.scope.paths);
        temp = made.dir;
        root = made.dir;
        label = `${testCase.sha.slice(0, 7)} ${short(testCase.note)}`.trim();
      } else {
        root = path.join(HERE, testCase.dir);
        label = `${path.basename(testCase.dir)} ${short(testCase.note)}`.trim();
      }

      try {
        // Evidence is always replayed strictly: the baseline records what this
        // repository tolerates today, and it must not silence a fixture whose
        // whole purpose is to be red.
        const result = await runMethod(method, { root, strict: true });

        // A green case is usually "nothing at all", but a commit can be the
        // proof that ONE class was closed while another finding of the same
        // method still stands in that tree. `expectAbsentCheck` says so out
        // loud instead of letting the baseline quietly launder it.
        const ok =
          testCase.expect === "red"
            ? result.status === "red" &&
              (!testCase.expectCheck || result.findings.some((f) => f.check === testCase.expectCheck)) &&
              (!testCase.expectFile || result.findings.some((f) => f.file.endsWith(testCase.expectFile)))
            : testCase.expectAbsentCheck
              ? !result.findings.some((f) => f.check === testCase.expectAbsentCheck)
              : result.status === "green";

        const expectLabel = testCase.expectAbsentCheck
          ? `green/${testCase.expectAbsentCheck}`
          : testCase.expect;

        if (!ok) failed += 1;
        rows.push({
          id: method.id,
          case: label,
          expect: expectLabel,
          got: result.findings.length ? `red(${result.findings.length})` : result.status,
          detail: ok
            ? result.findings.map((f) => f.check).join(", ") || "-"
            : `expected ${expectLabel}${testCase.expectCheck ? ` (${testCase.expectCheck})` : ""}, got ${result.status}: ${result.findings.map((f) => `${f.check} ${f.file}`).join("; ") || "no findings"}`,
          ok,
        });
      } finally {
        if (temp) cleanup(temp);
      }
    }
  }

  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return failed ? 1 : 0;
  }

  console.log(
    table(
      rows.map((r) => ({ id: r.id, ok: r.ok ? "ok" : MARK.mismatch, expect: r.expect, got: r.got, case: r.case })),
      [
        { key: "id", title: "ID" },
        { key: "ok", title: "" },
        { key: "expect", title: "EXPECT" },
        { key: "got", title: "GOT" },
        { key: "case", title: "CASE" },
      ]
    )
  );
  for (const r of rows.filter((row) => !row.ok)) console.log(`\n  FAIL ${r.id} ${r.case}\n       ${r.detail}`);
  console.log(`\n${rows.length - failed}/${rows.length} evidence cases hold.`);
  return failed ? 1 : 0;
}

/* -------------------------------------------------------------------- main */

export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[name] = true;
      else {
        flags[name] = next;
        i += 1;
      }
    } else positional.push(arg);
  }
  return { flags, positional };
}

const USAGE = `tm — реестр методов тестирования

  list                              все методы таблицей
  match --symptom "<текст>"         какой метод ловит этот симптом
  run <id|all> [--base <sha>]       прогнать детекторы (rc=1 на красном)
             [--strict] [--root d]  --strict: не прощать baseline
  verify <id|all>                   переиграть доказательства метода

  --json                            машинный вывод у любой команды
`;

export async function main(argv) {
  const { flags, positional } = parseArgs(argv);
  const [command, selector] = positional;
  const registry = loadRegistry(flags.registry ? path.resolve(flags.registry) : REGISTRY);

  switch (command) {
    case "list":
      return cmdList(registry, flags);
    case "match":
      return cmdMatch(registry, flags);
    case "run":
      return cmdRun(registry, selector ?? "all", flags);
    case "verify":
      return cmdVerify(registry, selector ?? "all", flags);
    default:
      console.log(USAGE);
      return command ? 2 : 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(String(error.message ?? error));
      process.exit(2);
    });
}
