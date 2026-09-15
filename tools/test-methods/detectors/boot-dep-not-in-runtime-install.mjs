/**
 * tm-001 — a module the server loads at BOOT that the runtime image does not
 * install.
 *
 * The bug this method was extracted from (f17-backend-image-sharp, PR #44,
 * 2026-09-15): `sharp` sat in `apps/backend/package.json` devDependencies while
 * `src/api/tenants/branding/upload/route.ts` imported it at module scope.
 * `medusa build` copies apps/backend/package.json VERBATIM into
 * `.medusa/server/package.json` (@medusajs/framework 2.19.0,
 * dist/build-tools/compiler.js:360), and the Dockerfile's runtime stage
 * installs from that copy with `npm install --omit=dev`. So the package was
 * present for tsc, present for the build, absent in the image, and the live
 * container died on its first start with `Cannot find module 'sharp'` inside a
 * `restart: unless-stopped` loop. Every gate before the live host was green.
 *
 * The class, stated so it travels to any project: a package imported by code
 * that runs before the process can answer a request must be installed by the
 * stage that produces the runtime image. Two ways that fails, one check each.
 *
 *  A. `boot-import-not-in-runtime-deps` — the import resolves to a package the
 *     runtime install drops (devDependencies under `--omit=dev`, an
 *     optional/peer-only entry, or nothing declared at all and resolved by
 *     workspace hoisting, which the single-app image does not reproduce).
 *
 *  B. `platform-bound-boot-import-ignores-scripts` — the package is platform
 *     bound (its optional dependencies carry `cpu:`/`os:` in the lockfile, the
 *     shape every prebuilt native addon takes), and the runtime install passes
 *     `--ignore-scripts`, so the binary half never lands even though the
 *     JavaScript half does. This is the same crash one layer down.
 *
 * What it deliberately does NOT flag: a `require()` inside a function body.
 * That module is loaded when an operator runs the script, not at boot, and
 * this repository has one on purpose (src/scripts/import-cherkashina-reviews.ts
 * requires `pg`, a devDependency, inside a helper).
 */
import path from "node:path";
import { builtinModules } from "node:module";
import { sourceView, lineAt, lineTextAt } from "../lib/source-view.mjs";
import { walkFiles, readIfPresent } from "../lib/walk.mjs";

const BUILTINS = new Set(builtinModules);

/** The package a bare specifier belongs to, or null for a relative/builtin one. */
export function packageOf(specifier, aliasPrefixes = []) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.startsWith("node:")) return null;
  if (aliasPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(prefix))) return null;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  if (BUILTINS.has(name)) return null;
  return name;
}

/** True when `offset` in the original source is real code rather than a blanked span. */
function isCode(view, offset) {
  return view.code[offset] === view.source[offset];
}

/** Brace depth of `offset` in the blanked view. 0 means module scope. */
function braceDepth(code, offset) {
  let depth = 0;
  for (let i = 0; i < offset; i += 1) {
    const ch = code[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  }
  return depth;
}

const STATIC_IMPORT = /\bimport\s+(?:type\s+)?[^;'"`]*?\bfrom\s*(['"])([^'"]+)\1/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*(['"])([^'"]+)\1/g;
const REEXPORT = /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*(['"])([^'"]+)\1/g;
const REQUIRE = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

/**
 * Every specifier the module pulls in at module scope, with the line it sits
 * on. `import type` is included and then dropped by the caller only if the
 * project erases types, which this one does not need: a type-only import of a
 * devDependency is compiled away by tsc and never reaches the image, so it is
 * filtered here rather than reported.
 */
export function bootImports(src) {
  const view = sourceView(src);
  const found = [];

  const collect = (re, kind) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      if (!isCode(view, m.index)) continue;
      const head = m[0];
      if (kind === "import" && /\bimport\s+type\b/.test(head)) continue;
      if (kind === "reexport" && /\bexport\s+type\b/.test(head)) continue;
      if (kind === "require" && braceDepth(view.code, m.index) > 0) continue;
      found.push({ specifier: m[2], kind, line: lineAt(src, m.index), text: lineTextAt(src, m.index) });
    }
  };

  collect(STATIC_IMPORT, "import");
  collect(SIDE_EFFECT_IMPORT, "import");
  collect(REEXPORT, "reexport");
  collect(REQUIRE, "require");

  // The two import regexes overlap on `import x from "y"`; keep one entry per
  // (specifier, line).
  const seen = new Set();
  return found.filter((entry) => {
    const key = `${entry.specifier}@${entry.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Packages the lockfile shows as platform bound: their optional dependencies
 * are per-platform builds, each declaring `cpu:` or `os:`. Parsed off the two
 * lockfile sections directly, because this repository has no YAML dependency
 * and adding one to run a check would be its own kind of drift.
 */
export function platformBoundPackages(lock) {
  if (!lock) return new Set();

  const platformEntries = new Set();
  const entryHead = /^ {2}'?((?:@[^/'\s]+\/)?[^@'\s]+)@[^\s:]+'?:\s*$/;
  const lines = lock.split("\n");

  let current = null;
  for (const line of lines) {
    const head = entryHead.exec(line);
    if (head) {
      current = head[1];
      continue;
    }
    if (current && /^ {4}(cpu|os):\s*\[/.test(line)) {
      platformEntries.add(current);
      current = null;
    }
  }

  const bound = new Set();
  let parent = null;
  let inOptional = false;
  for (const line of lines) {
    const head = entryHead.exec(line);
    if (head) {
      parent = head[1];
      inOptional = false;
      continue;
    }
    if (/^ {4}optionalDependencies:\s*$/.test(line)) {
      inOptional = true;
      continue;
    }
    if (/^ {4}\S/.test(line)) inOptional = false;
    if (inOptional && parent) {
      const dep = /^ {6}'?((?:@[^/'\s]+\/)?[^:'\s]+)'?:/.exec(line);
      if (dep && platformEntries.has(dep[1])) bound.add(parent);
    }
  }

  return bound;
}

/** The install command the runtime stage of a Dockerfile runs, if any. */
export function runtimeInstallLine(dockerfile) {
  if (!dockerfile) return null;
  const stages = dockerfile.split(/^FROM /m);
  const runtime = stages[stages.length - 1] ?? "";
  const match = /^RUN\s+((?:npm|pnpm|yarn)\s+install[^\n]*)$/m.exec(runtime);
  return match ? match[1].trim() : null;
}

export const id = "tm-001";

export function run(root, config) {
  const app = config.app;
  const pkgRaw = readIfPresent(root, path.join(app, "package.json"));
  const findings = [];
  const checked = { files: 0, imports: 0, packages: 0 };

  if (!pkgRaw) {
    return { status: "skipped", reason: `${app}/package.json is absent in this tree`, findings, checked };
  }

  const pkg = JSON.parse(pkgRaw);
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const optDeps = pkg.optionalDependencies ?? {};
  const peerDeps = pkg.peerDependencies ?? {};

  const files = [
    ...config.bootDirs.flatMap((dir) =>
      walkFiles(root, path.join(app, dir), { skip: config.skipDirs ?? [] })
    ),
    ...(config.bootFiles ?? [])
      .map((file) => path.join(app, file))
      .filter((file) => readIfPresent(root, file) !== null),
  ];

  /** package name -> first import site that reaches it at boot */
  const atBoot = new Map();

  for (const file of files) {
    const src = readIfPresent(root, file);
    if (src === null) continue;
    checked.files += 1;
    for (const entry of bootImports(src)) {
      checked.imports += 1;
      const name = packageOf(entry.specifier, config.aliasPrefixes ?? []);
      if (!name) continue;
      if (!atBoot.has(name)) atBoot.set(name, { ...entry, file, package: name });
    }
  }

  checked.packages = atBoot.size;

  for (const [name, site] of atBoot) {
    if (Object.hasOwn(deps, name)) continue;
    let where = null;
    if (Object.hasOwn(devDeps, name)) where = "devDependencies";
    else if (Object.hasOwn(optDeps, name)) where = "optionalDependencies";
    else if (Object.hasOwn(peerDeps, name)) where = "peerDependencies";

    findings.push({
      check: "boot-import-not-in-runtime-deps",
      severity: "red",
      package: name,
      file: site.file,
      line: site.line,
      evidence: site.text,
      message: where
        ? `${name} is imported at boot but declared in ${where}; the runtime stage installs with --omit=dev and the container dies on "Cannot find module '${name}'". Move it to dependencies.`
        : `${name} is imported at boot but declared in no dependency field of ${app}/package.json; it resolves here through workspace hoisting, which the runtime image does not reproduce.`,
    });
  }

  const lock = readIfPresent(root, config.lockfile ?? "pnpm-lock.yaml");
  const bound = platformBoundPackages(lock);
  const installLine = runtimeInstallLine(readIfPresent(root, config.dockerfile ?? ""));
  const ignoresScripts = Boolean(installLine && /--ignore-scripts\b/.test(installLine));

  if (ignoresScripts) {
    for (const [name, site] of atBoot) {
      if (!bound.has(name)) continue;
      findings.push({
        check: "platform-bound-boot-import-ignores-scripts",
        severity: "red",
        package: name,
        file: site.file,
        line: site.line,
        evidence: installLine,
        message: `${name} ships its binary half as per-platform optional packages, and the runtime install runs with --ignore-scripts, so the JavaScript half arrives without it.`,
      });
    }
  }

  return {
    status: findings.length ? "red" : "green",
    findings,
    checked: {
      ...checked,
      platformBound: [...bound].filter((name) => atBoot.has(name)),
      runtimeInstall: installLine,
    },
  };
}
