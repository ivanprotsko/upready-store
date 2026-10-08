#!/usr/bin/env node
/**
 * The markdown reader lives in two apps and must stay byte-identical
 * (b18-blog-full): the tenant panel renders a live preview of an article and
 * the storefront renders the article, and a preview that reads the source
 * differently from the page is worse than no preview.
 *
 * It is a copy rather than a shared import because `apps/tenant-panel/Dockerfile`
 * copies only `apps/tenant-panel` into the image — an import across the two apps
 * builds locally and breaks the panel image, which nothing in this repo would
 * catch before a deploy.
 *
 *   node scripts/check-shared-markdown.mjs      # pnpm check:shared-markdown
 *
 * The school cabinet (`apps/school`, t-2026-10-08-37) keeps a copy of the
 * same reader and of the lesson-text parser built on it, so a lesson reads the
 * same in the school as in the shop's account. The school installs and builds
 * on its own, with no import path into the storefront, so it is a copy for the
 * same reason, held to the same rule.
 *
 * The school also keeps a copy of the `@upready/shop-sso` package
 * (`apps/shared/shop-sso`, t-2026-10-08-36), the shop sign-in it runs on.
 * `apps/school/Dockerfile` copies only `apps/school`, so the package cannot be
 * imported there either.
 *
 * Exit 0 when every pair is equal, 1 when one drifts, naming the first
 * differing line so the fix is a copy and not a hunt.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pairs = [
  ["apps/storefront/src/lib/util/markdown.ts", "apps/tenant-panel/src/lib/markdown.ts"],
  ["apps/storefront/src/lib/util/markdown.ts", "apps/school/app/lib/vendor/markdown.ts"],
  ["apps/storefront/src/lib/util/lesson-body.ts", "apps/school/app/lib/vendor/lesson-body.ts"],
  ["apps/shared/shop-sso/src/index.ts", "apps/school/app/lib/vendor/shop-sso.ts"],
]

const read = (rel) => {
  try {
    return readFileSync(path.join(root, rel), "utf8")
  } catch (error) {
    console.error(`check-shared-markdown: cannot read ${rel}: ${error.message}`)
    process.exit(1)
  }
}

let drifted = false

for (const pair of pairs) {
  const [a, b] = pair.map(read)

  if (a === b) {
    const lines = a.split("\n").length
    console.log(`check-shared-markdown: OK — ${pair.join(" == ")} (${lines} lines, identical)`)
    continue
  }

  drifted = true
  const linesA = a.split("\n")
  const linesB = b.split("\n")
  const at = linesA.findIndex((line, index) => line !== linesB[index])

  console.error(
    [
      "check-shared-markdown: two copies of a shared module have drifted.",
      `  ${pair[0]}  (${linesA.length} lines)`,
      `  ${pair[1]}  (${linesB.length} lines)`,
      at >= 0 ? `  first difference at line ${at + 1}:` : "  one file is a prefix of the other:",
      at >= 0 ? `    source: ${JSON.stringify(linesA[at] ?? null)}` : "",
      at >= 0 ? `    copy:   ${JSON.stringify(linesB[at] ?? null)}` : "",
      `  fix: cp ${pair[0]} ${pair[1]}   (after deciding which side is right)`,
    ]
      .filter(Boolean)
      .join("\n"),
  )
}

process.exit(drifted ? 1 : 0)
