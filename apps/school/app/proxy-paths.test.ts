import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import config from "../react-router.config"
import routes from "./routes"

/**
 * The proxy sends the school only some paths of its host; the landing owns the
 * rest (deploy/compose.mt.yml, service `school`). A route outside those paths,
 * or a request the client makes on a path of its own, would reach the landing
 * and answer its 404 without an error anywhere in the school.
 */
const compose = readFileSync(fileURLToPath(new URL("../../../deploy/compose.mt.yml", import.meta.url)), "utf8")
const rule = /traefik\.http\.routers\.mt-school\.rule=(.*)$/m.exec(compose)?.[1] ?? ""
const proxied = [...rule.matchAll(/PathPrefix\(`([^`]+)`\)/g)].map((match) => match[1])

// Docker's health check calls the container directly; the proxy never needs it.
const INTERNAL = new Set(["healthz"])

describe("the paths the proxy sends to the school", () => {
  it("are read from compose.mt.yml", () => {
    expect(proxied).toEqual(["/app", "/login", "/auth", "/logout", "/assets"])
  })

  it("cover every route of the app", () => {
    for (const route of routes) {
      const first = route.path?.split("/")[0] ?? ""

      if (!INTERNAL.has(first)) {
        expect(proxied, route.path).toContain(`/${first}`)
      }
    }
  })

  it("need no `/__manifest`: the route manifest comes with the first page", () => {
    expect(config.routeDiscovery).toEqual({ mode: "initial" })
  })
})
