import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// The React Router plugin is left out on purpose: the tests import the route
// modules directly and render them through a static router, on node.
export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.{ts,tsx}"],
  },
})
