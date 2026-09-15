import fs from "node:fs";
import path from "node:path";

const DEFAULT_SKIP = new Set(["node_modules", ".git", ".next", ".medusa", "dist", "build"]);

/**
 * Every file under `dir` whose extension is in `exts`, as paths relative to
 * `root`. Directories named in `skip` are not entered. A missing directory
 * yields nothing rather than throwing, because a detector's scope is written
 * once and has to survive a commit where one of its paths does not exist yet.
 */
export function walkFiles(root, dir, { exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"], skip = [] } = {}) {
  const skipSet = new Set([...DEFAULT_SKIP, ...skip]);
  const out = [];
  const start = path.join(root, dir);

  const visit = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skipSet.has(entry.name)) continue;
        visit(full);
      } else if (entry.isFile() && exts.includes(path.extname(entry.name))) {
        out.push(path.relative(root, full));
      }
    }
  };

  visit(start);
  return out.sort();
}

export function readIfPresent(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}
