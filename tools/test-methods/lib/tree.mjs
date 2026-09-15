/**
 * Materialising a tree to run a detector against.
 *
 * A detector has to be provable, which means running it on the commit the bug
 * was found in and on the commit that fixed it. Checking those out in the
 * working tree is not an option: another session may hold this worktree, and a
 * checkout would move the branch under whoever is reading it. `git archive`
 * writes the tree of any commit into a temporary directory without touching
 * HEAD, the index or the working tree, and it takes pathspecs, so a detector
 * pays only for the directories its scope names.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The repository root that holds this file. */
export function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: path.dirname(new URL(import.meta.url).pathname),
    encoding: "utf8",
  }).trim();
}

export function resolveSha(rev, cwd = repoRoot()) {
  return execFileSync("git", ["rev-parse", "--verify", `${rev}^{commit}`], {
    cwd,
    encoding: "utf8",
  }).trim();
}

/**
 * Write the tree of `rev` into a fresh temporary directory and return its path.
 * `paths` limits the extraction; an empty list extracts everything.
 *
 * The caller owns the directory and passes it to `cleanup()` when done. A
 * pathspec that matches nothing in that commit makes `git archive` exit
 * non-zero, so each one is probed first and the misses are reported rather
 * than crashing a run (a directory that did not exist yet at an old commit is
 * a fact about that commit, not an error).
 */
export function materialize(rev, paths = [], cwd = repoRoot()) {
  const sha = resolveSha(rev, cwd);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tm-${sha.slice(0, 8)}-`));
  const present = [];
  const missing = [];

  for (const p of paths) {
    const probe = execFileSync("git", ["ls-tree", "-r", "--name-only", sha, "--", p], {
      cwd,
      encoding: "utf8",
    });
    if (probe.trim()) present.push(p);
    else missing.push(p);
  }

  const args = ["archive", "--format=tar", sha];
  if (paths.length) args.push("--", ...present);

  if (present.length || !paths.length) {
    const tar = execFileSync("git", args, { cwd, maxBuffer: 512 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", dir], { input: tar, maxBuffer: 512 * 1024 * 1024 });
  }

  return { dir, sha, missing };
}

export function cleanup(dir) {
  if (dir && dir.includes("tm-")) fs.rmSync(dir, { recursive: true, force: true });
}
