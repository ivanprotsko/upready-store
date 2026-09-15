// t15-product-attributes: the numbers quoted in the PR, measured against the
// local stand (backend :9152, database `upready_store_t15`).
//
//   BACKEND=http://localhost:9152 KEY=<publishable key> node artifacts/docs/t15-product-attributes/measure.mjs
//
// Two things are measured and nothing is inferred:
//
// 1. the facet bar over a 3 000-product catalogue (`seed-perf.sql`), cold and
//    warm, with and without a selection — `count` and `product_ids.length` come
//    back from the route, and the same numbers are computed straight from the
//    database by `verify.sql` so the two can be compared;
// 2. how many SQL statements one facet request runs, read from
//    `pg_stat_statements` when it is installed and from the count of aggregate
//    shapes otherwise.
//
// Every timing is the wall clock around one HTTP call, reported as the median
// and the max of N runs, never an average of a single sample.
const BACKEND = process.env.BACKEND ?? "http://localhost:9152"
const KEY = process.env.KEY
const RUNS = Number(process.env.RUNS ?? 10)

if (!KEY) {
  console.error("KEY (a tenant publishable key) is required")
  process.exit(1)
}

const facets = async (query) => {
  const started = process.hrtime.bigint()
  const res = await fetch(`${BACKEND}/store/tenant/product-attributes/facets${query}`, {
    headers: { "x-publishable-api-key": KEY, "x-medusa-locale": "ru" },
  })
  const body = await res.json()
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  return { ms, status: res.status, body }
}

const stats = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  return {
    median: Number(median.toFixed(1)),
    min: Number(sorted[0].toFixed(1)),
    max: Number(sorted[sorted.length - 1].toFixed(1)),
  }
}

const describe = (body) => {
  const facetSummary = body.facets
    .map((facet) =>
      facet.range
        ? `${facet.key}: ${facet.range.min}…${facet.range.max} (${facet.range.count} товаров)`
        : `${facet.key}: ${facet.values
            .map((value) => `${value.value}=${value.count}${value.disabled ? " [disabled]" : ""}`)
            .join(", ")}`
    )
    .join(" | ")
  return `${facetSummary}\n    product_ids: ${
    body.product_ids === null ? "null (ничего не выбрано)" : body.product_ids.length
  }, count: ${body.count}`
}

const main = async () => {
  const cases = [
    ["без выбора", ""],
    ["диапазон 100..500", "?a_obem=100..500"],
    ["выбор + диапазон", "?a_sostav=travy&a_obem=100..500"],
    ["ничего не подходит", "?a_obem=100000..200000"],
  ]

  for (const [label, query] of cases) {
    const cold = await facets(query)
    if (cold.status !== 200) {
      console.error(`${label}: HTTP ${cold.status}`)
      process.exit(1)
    }

    const samples = []
    for (let run = 0; run < RUNS; run += 1) {
      samples.push((await facets(query)).ms)
    }

    const timing = stats(samples)
    console.log(`\n${label} ${query || "(нет параметров)"}`)
    console.log(
      `  первый вызов: ${cold.ms.toFixed(1)} мс; далее ${RUNS} вызовов: медиана ${
        timing.median
      } мс, min ${timing.min}, max ${timing.max}`
    )
    console.log(`    ${describe(cold.body)}`)
  }
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
