import type { Config } from "@react-router/dev/config"

// Every page is rendered on the server: the buyer's token lives in an httpOnly
// cookie, and only the server talks to the shop's API.
export default {
  ssr: true,
} satisfies Config
