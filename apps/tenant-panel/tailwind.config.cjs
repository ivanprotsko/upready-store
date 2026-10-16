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
      // t-2026-10-17-01: hub-v2's radius scale (--radius 0.45rem, its own multipliers), given to the
      // classes the kit draws each role with. `md` is a control (button, field, menu item): hub-v2's
      // 2xl. `lg` is a surface (card, menu, modal): its 3xl. `xl` is its 4xl, a card or a dialog.
      // The value lives in src/theme/hub-theme.css as --hub-radius.
      borderRadius: {
        sm: "calc(var(--hub-radius) * 0.6)",
        DEFAULT: "calc(var(--hub-radius) * 0.8)",
        md: "calc(var(--hub-radius) * 1.8)",
        lg: "calc(var(--hub-radius) * 2.2)",
        xl: "calc(var(--hub-radius) * 2.6)",
        "2xl": "calc(var(--hub-radius) * 3)",
        "3xl": "calc(var(--hub-radius) * 3.4)",
      },
      // hub-v2's body weight (apps/hub-v2/app/app.css --font-weight-text): the kit's Text puts
      // `font-normal` on every regular run of text.
      fontWeight: {
        normal: "450",
      },
    },
  },
  plugins: [],
}
