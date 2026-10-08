import tsParser from "@typescript-eslint/parser"
import reactHooks from "eslint-plugin-react-hooks"

/**
 * Flat config for the school, the same small rule set as the tenant panel:
 * the hook rules as errors, so an effect that misses a dependency fails the
 * lint instead of a page at runtime. Types are `tsc --noEmit`'s job.
 */
export default [
  { ignores: ["build/**", "node_modules/**", ".react-router/**"] },
  {
    files: ["app/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
]
