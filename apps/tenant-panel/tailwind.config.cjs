const path = require("path")

// Same as packages/admin/dashboard/tailwind.config.cjs: scan our source and the
// @medusajs/ui components we render, on top of the Medusa UI preset.
const medusaUI = path.join(
  path.dirname(require.resolve("@medusajs/ui")),
  "**/*.{js,jsx,ts,tsx}"
)

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("@medusajs/ui-preset")],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", medusaUI],
  darkMode: "class",
  theme: {
    extend: {
      // t-2026-10-17-01: no drop shadow in the panel (Ivan 17.10.2026: «и не убраны тени» … «убрать, я
      // же просил убрать»). Tailwind's own scales draw nothing; the preset's named shadows (shadow-
      // elevation-*, shadow-borders-*, …) stay and take their lines from src/theme/hub-theme.css.
      boxShadow: Object.fromEntries(
        ["sm", "DEFAULT", "md", "lg", "xl", "2xl", "inner"].map((k) => [k, "none"])
      ),
      dropShadow: Object.fromEntries(
        ["sm", "DEFAULT", "md", "lg", "xl", "2xl"].map((k) => [k, "0 0 #0000"])
      ),
    },
  },
  plugins: [],
}
