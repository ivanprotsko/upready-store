#!/usr/bin/env node
/**
 * DNS for the multi-tenant test deployment (Ivan, 2026-09-11): the engine on
 * shipshift.dev and three tenant shops on their own domains.
 *
 *   node deploy/scripts/mt-dns-records.mjs            # dry run, prints the plan
 *   node deploy/scripts/mt-dns-records.mjs --backup   # every record of the four zones -> a JSON file
 *   DNS_APPLY_OK=1 node deploy/scripts/mt-dns-records.mjs --apply
 *
 * Every record is `proxied=false` for the same measured reason the stands are
 * (deploy/README.md step 1): Cloudflare must not terminate TLS in front of
 * traefik, which answers the Let's Encrypt HTTP-01 challenge itself.
 *
 * Credentials: the GLOBAL key, read one line at a time out of ~/upready/.env.keys
 * — sourcing that whole file silently leaves variables empty
 * (~/upready/memory/env-keys-sourcing-trap.md).
 */
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const KEYS = join(homedir(), "upready", ".env.keys")

const key = (name) => {
  const line = readFileSync(KEYS, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`))
  const value = line ? line.slice(name.length + 1).trim() : ""
  if (!value) {
    throw new Error(`${name} is empty in ${KEYS}`)
  }
  return value
}

const EMAIL = key("CLOUDFLARE_EMAIL")
const GLOBAL = key("CLOUDFLARE_GLOBAL_API_KEY")
const IP = key("CONTABO_SERVER_IP")

const cf = async (path, init = {}) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      "X-Auth-Email": EMAIL,
      "X-Auth-Key": GLOBAL,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const body = await response.json()
  if (!body.success) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${JSON.stringify(body.errors)}`)
  }
  return body.result
}

/** name -> what must stand there. Anything else in these zones is left alone. */
const PLAN = [
  { zone: "shipshift.dev", name: "shipshift.dev", why: "the engine: Medusa API + /app" },
  { zone: "shipshift.dev", name: "panel.shipshift.dev", why: "the shop owner's panel" },
  { zone: "shipshift.dev", name: "stores.shipshift.dev", why: "CNAME target handed to shop owners" },
  { zone: "shipshift.dev", name: "*.shipshift.dev", why: "technical subdomain of every tenant" },
  { zone: "custombot.space", name: "custombot.space", why: "tenant Acme" },
  { zone: "custombot.space", name: "www.custombot.space", why: "tenant Acme (www)" },
  { zone: "setpomo.com", name: "setpomo.com", why: "tenant Globex" },
  { zone: "setpomo.com", name: "www.setpomo.com", why: "tenant Globex (www)" },
  { zone: "shiftship.dev", name: "shiftship.dev", why: "tenant Initech" },
  { zone: "shiftship.dev", name: "www.shiftship.dev", why: "tenant Initech (www)" },
]

const zones = async () => {
  const all = await cf("/zones?per_page=50")
  return new Map(all.map((z) => [z.name, z.id]))
}

const main = async () => {
  const mode = process.argv.includes("--apply")
    ? "apply"
    : process.argv.includes("--backup")
      ? "backup"
      : "plan"
  const zoneId = await zones()
  const names = [...new Set(PLAN.map((r) => r.zone))]

  const existing = new Map()
  for (const zone of names) {
    const records = await cf(`/zones/${zoneId.get(zone)}/dns_records?per_page=100`)
    existing.set(zone, records)
  }

  if (mode === "backup") {
    const out = process.argv[process.argv.indexOf("--backup") + 1] || "dns-backup.json"
    writeFileSync(out, JSON.stringify(Object.fromEntries(existing), null, 2))
    console.log(`backed up ${[...existing.values()].flat().length} records of ${names.length} zones -> ${out}`)
    return
  }

  let changes = 0
  for (const row of PLAN) {
    const records = existing.get(row.zone)
    const here = records.filter((r) => r.name === row.name && ["A", "AAAA", "CNAME"].includes(r.type))
    const good = here.find((r) => r.type === "A" && r.content === IP && r.proxied === false)
    const stale = here.filter((r) => r !== good)

    if (good && stale.length === 0) {
      console.log(`ok      ${row.name.padEnd(24)} A -> host (${row.why})`)
      continue
    }

    for (const r of stale) {
      console.log(`REPLACE ${row.name.padEnd(24)} ${r.type} ${r.content} proxied=${r.proxied}  (${row.why})`)
      changes += 1
      if (mode === "apply") {
        await cf(`/zones/${zoneId.get(row.zone)}/dns_records/${r.id}`, { method: "DELETE" })
      }
    }
    if (!good) {
      console.log(`CREATE  ${row.name.padEnd(24)} A ${IP} proxied=false  (${row.why})`)
      changes += 1
      if (mode === "apply") {
        await cf(`/zones/${zoneId.get(row.zone)}/dns_records`, {
          method: "POST",
          body: JSON.stringify({
            type: "A",
            name: row.name,
            content: IP,
            ttl: 60,
            proxied: false,
            comment: `upready-store multitenancy test deploy — ${row.why}`,
          }),
        })
      }
    }
  }

  console.log(
    mode === "apply"
      ? `\napplied ${changes} change(s).`
      : `\n${changes} change(s) pending. Re-run with --apply (and DNS_APPLY_OK=1) to make them.`,
  )
}

if (process.argv.includes("--apply") && process.env.DNS_APPLY_OK !== "1") {
  console.error("refusing to write DNS without DNS_APPLY_OK=1")
  process.exit(1)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
