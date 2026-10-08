import type { Config } from "@react-router/dev/config"

export default {
  // Every page is rendered on the server: the buyer's token lives in an
  // httpOnly cookie, and only the server talks to the shop's API.
  ssr: true,
  // The whole route manifest comes with the first page. Lazy discovery would
  // fetch `/__manifest`, a path the proxy does not send to the school
  // (deploy/compose.mt.yml routes only /app, /login, /auth, /logout and
  // /assets here), so a click would land on the landing's 404.
  routeDiscovery: { mode: "initial" },
} satisfies Config
