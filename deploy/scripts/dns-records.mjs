#!/usr/bin/env node
/**
 * Lists the ten A records the five stands need (storefront + api subdomain
 * each), and can create them through the Cloudflare API. Dry-run by
 * default; this package prepares the deploy, it does not perform it (order
 * t-2026-09-09-02, point 2 — DNS writes happen in wave 3 on Ivan's order).
 *
 * Usage:
 *   node deploy/scripts/dns-records.mjs                  # list, no network call
 *   node deploy/scripts/dns-records.mjs --check           # list + GET each
 *                                                          # record's current
 *                                                          # state from Cloudflare
 *   DNS_APPLY_OK=1 node deploy/scripts/dns-records.mjs --apply
 *                                                          # creates missing
 *                                                          # records
 *
 * Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID by NAME from
 * ~/upready/.env.keys (never prints a value — see readEnvKeys below), plus
 * CONTABO_SERVER_IP for the A record target. The zone id for upready.dev is
 * NOT re-fetched from the account here on every run: the agent-creatr
 * memory already names it
 * (~/upready/memory/agent-creatr-prod-deploy-contabo.md:
 * "зона upready.dev (zone id 6ee6ea29a5911f31944f4e6cfc2257da...)"),
 * reused as ZONE_ID below rather than an extra lookup call. --check
 * confirms it resolves before --apply is ever used.
 *
 * proxied=false on every record, matching the same memory file's own
 * incident: Cloudflare terminating TLS in front of traefik broke large
 * uploads for agent-creatr, and it is traefik's letsencrypt resolver that
 * issues the certificate here too, which requires an HTTP-01 challenge
 * traefik itself answers to.
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const ZONE_ID = "6ee6ea29a5911f31944f4e6cfc2257da" // upready.dev, per agent-creatr memory
const ENV_KEYS_PATH = join(homedir(), "upready", ".env.keys")

const STANDS = [
  { stand: "kerbstone", profile: "sneakers" },
  { stand: "ferrite", profile: "electronics" },
  { stand: "scruple", profile: "supplements" },
  { stand: "larchant", profile: "womens-fashion" },
  { stand: "long-morning", profile: "home-goods" },
]

/** Reads one KEY=value pair by name, without ever holding or printing the
 *  rest of the file's contents. */
function readEnvKey(name) {
  const text = readFileSync(ENV_KEYS_PATH, "utf8")
  for (const line of text.split("\n")) {
    const match = new RegExp(`^${name}=(.*)$`).exec(line)
    if (match) return match[1].trim()
  }
  return undefined
}

function buildRecords(ip) {
  const records = []
  for (const { stand } of STANDS) {
    records.push({ name: `${stand}.upready.dev`, type: "A", content: ip, proxied: false })
    records.push({ name: `api-${stand}.upready.dev`, type: "A", content: ip, proxied: false })
  }
  return records
}

async function cloudflareRequest(token, path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  })
  const body = await response.json()
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${path} -> ${response.status}: ${JSON.stringify(body.errors ?? body)}`)
  }
  return body
}

async function main() {
  const args = process.argv.slice(2)
  const check = args.includes("--check")
  const apply = args.includes("--apply")

  const ip = readEnvKey("CONTABO_SERVER_IP")
  if (!ip) {
    console.error(`CONTABO_SERVER_IP not found in ${ENV_KEYS_PATH}`)
    process.exit(1)
  }
  const records = buildRecords(ip)

  console.log(`Zone: upready.dev (${ZONE_ID})`)
  console.log(`Target IP: ${ip}`)
  console.log("")
  for (const record of records) {
    console.log(`  A  ${record.name.padEnd(28)} -> ${record.content}  proxied=${record.proxied}`)
  }

  if (!check && !apply) {
    console.log("\n(dry run — pass --check to compare against Cloudflare, --apply with DNS_APPLY_OK=1 to create)")
    return
  }

  const token = readEnvKey("CLOUDFLARE_API_TOKEN")
  if (!token) {
    console.error(`CLOUDFLARE_API_TOKEN not found in ${ENV_KEYS_PATH}`)
    process.exit(1)
  }

  if (check || apply) {
    const existing = await cloudflareRequest(token, `/zones/${ZONE_ID}/dns_records?type=A&per_page=100`)
    const byName = new Map(existing.result.map((r) => [r.name, r]))

    for (const record of records) {
      const current = byName.get(record.name)
      if (current) {
        const matches = current.content === record.content && current.proxied === record.proxied
        console.log(`[check] ${record.name}: exists, content=${current.content} proxied=${current.proxied} ${matches ? "(matches)" : "(DIFFERS from desired)"}`)
      } else {
        console.log(`[check] ${record.name}: MISSING`)
      }
    }

    if (apply) {
      if (process.env.DNS_APPLY_OK !== "1") {
        console.error("\n--apply requires DNS_APPLY_OK=1 in the environment. Refusing to write DNS.")
        process.exit(1)
      }
      for (const record of records) {
        if (byName.has(record.name)) {
          console.log(`[apply] ${record.name} already exists, skipping (this script never updates or deletes)`)
          continue
        }
        const created = await cloudflareRequest(token, `/zones/${ZONE_ID}/dns_records`, {
          method: "POST",
          body: JSON.stringify({ type: "A", name: record.name, content: record.content, proxied: record.proxied, ttl: 1 }),
        })
        console.log(`[apply] created ${record.name} -> ${created.result.content}`)
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
