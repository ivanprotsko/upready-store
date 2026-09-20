import { defineConfig } from "vitest/config"

const SF =
  "/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-page-markdown/apps/storefront"

export default defineConfig({
  resolve: {
    alias: [
      { find: "@i18n/navigation", replacement: "/tmp/f07/shim-navigation.tsx" },
      { find: /^@modules\/(.*)/, replacement: `${SF}/src/modules/$1` },
      { find: /^@lib\/(.*)/, replacement: `${SF}/src/lib/$1` },
      { find: /^react-dom\/server$/, replacement: `${SF}/node_modules/react-dom/server.js` },
      { find: /^react-dom$/, replacement: `${SF}/node_modules/react-dom/index.js` },
      { find: /^react\/jsx-dev-runtime$/, replacement: `${SF}/node_modules/react/jsx-dev-runtime.js` },
      { find: /^react\/jsx-runtime$/, replacement: `${SF}/node_modules/react/jsx-runtime.js` },
      { find: /^react$/, replacement: `${SF}/node_modules/react/index.js` },
    ],
  },
  esbuild: { jsx: "automatic" },
  test: { include: ["render.test.tsx"], environment: "node" },
})
