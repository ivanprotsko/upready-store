/**
 * Из tasks-src.json + features.json собирает:
 *   templates-tasks.json — записи ровно той формы, что читает диспетчер (handoff/.../tasks.json)
 *   prompts/<id>.md      — промпт исполнителю на английском (правило 3a)
 * `why` каждой задачи берёт числа ИЗ РЕЕСТРА, а не из головы: «есть у InSales: да/нет».
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const src = JSON.parse(readFileSync(`${ROOT}/tasks-src.json`, "utf8"))
const features = new Map(JSON.parse(readFileSync(`${ROOT}/features.json`, "utf8")).map((r) => [r.id, r]))
const RESEARCH = "artifacts/research/2026-09-16-store-templates-functionality"

mkdirSync(`${ROOT}/prompts`, { recursive: true })
const tasks = []

for (const t of src) {
  const rows = t.features.map((id) => {
    const r = features.get(id)
    if (!r) throw new Error(`в реестре нет функции ${id} (задача ${t.id})`)
    return r
  })

  const why = rows.map((r) =>
    `${r.id} («${r.name_ru}»): у нас — ${r.upready_store}${r.upready_where ? ` (${r.upready_where.split(";")[0]})` : ""}; ` +
    `есть у InSales: ${r.insales.count ? `да, в ${r.insales.count} шаблонах` : "нет"}; ` +
    `есть у Tilda: ${r.tilda.count ? `да, в ${r.tilda.count} шаблонах` : "нет"}`
  ).join(" | ")

  tasks.push({
    id: t.id,
    title: t.title,
    kind: "build",
    lane: "build",
    model: "opus",
    effort: "high",
    branch: `feat/day16-${t.id}`,
    deps: t.deps,
    softDeps: t.softDeps,
    priority: t.priority,
    prompt: `${t.id}.md`,
    source: "r03-store-templates-functionality",
    acceptance: t.measure.join(" "),
    why,
    features: t.features,
    side: t.side,
  })

  const evidence = rows.flatMap((r) => {
    const ins = r.insales.templates.slice(0, 2).map((u) => `  - InSales, «${r.name_ru}»: ${u}`)
    const til = r.tilda.templates.slice(0, 2).map((u) => `  - Tilda, «${r.name_ru}»: ${u}`)
    return [...ins, ...til]
  })

  const md = [
    `# ${t.id} — ${t.title}`,
    "",
    `Branch \`feat/day16-${t.id}\`, cut from \`dev\`, one Superset workspace, one PR into \`dev\`. Language: Russian is fine for prose and commits, English for identifiers.`,
    "",
    "## Order",
    "",
    t.order,
    "",
    "## Where this comes from",
    "",
    `Research \`${RESEARCH}/\` on this repository (task r03). Read \`report.md\` §2 and the rows of \`features.json\` whose \`id\` is one of: ${t.features.map((x) => `\`${x}\``).join(", ")}. Each row carries the templates where the feature was seen and what our own product has today — the \`upready_store\` and \`upready_where\` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.`,
    "",
    "Evidence to look at before you design anything:",
    "",
    ...evidence,
    "",
    "Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.",
    "",
    "## What to build",
    "",
    ...t.build.map((b) => `- ${b}`),
    "",
    "## How it is measured (rule 18f — reality, not «should work»)",
    "",
    ...t.measure.map((m) => `- ${m}`),
    "",
    "Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/" + t.id + "/`.",
    "",
    "## Boundaries",
    "",
    `- ${t.side === "backend" ? "Backend and owner panel only; do not redesign the storefront in this task." : "Storefront only; if you need data the API does not return, name the missing endpoint in the PR instead of adding a backend model here."}`,
    "- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.",
    "- A schema change on a live database is preceded by `pg_dump`.",
    "",
    "## Finish",
    "",
    "Checks green (name them with their result lines) → `git push -u origin " + `feat/day16-${t.id}` + "` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.",
    "",
  ].join("\n")
  writeFileSync(`${ROOT}/prompts/${t.id}.md`, md)
}

writeFileSync(`${ROOT}/templates-tasks.json`, JSON.stringify(tasks, null, 1))
console.log(`templates-tasks.json: ${tasks.length} задач (${tasks.filter((x) => x.side === "backend").length} бэкенд, ${tasks.filter((x) => x.side === "storefront").length} витрина)`)
console.log(`prompts/: ${tasks.length} файлов`)
for (const t of tasks) console.log(`  ${t.priority} ${t.id.padEnd(34)} deps=${t.deps.join(",") || "—"}`)
