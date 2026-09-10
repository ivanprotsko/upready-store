import tsParser from "@typescript-eslint/parser"
import reactHooks from "eslint-plugin-react-hooks"

/**
 * Flat config for the tenant panel (ESLint 9 needs one; the `--ext` flag of
 * the eslintrc era is gone). The rule set is deliberately small: the screens
 * under `src/` are the Admin's files copied verbatim (rule of the panel), so
 * this config exists to catch mistakes in the panel's own wiring, not to
 * re-review upstream code. `react-hooks/exhaustive-deps` reports eleven places
 * in the copied Admin files as of 2.19.0; they are upstream's and stay as
 * warnings, `rules-of-hooks` stays an error.
 */
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]
