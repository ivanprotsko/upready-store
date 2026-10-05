const path = require("path")

module.exports = {
  darkMode: ["selector", '[data-mode="dark"]'],
  presets: [require("@medusajs/ui-preset")],
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/modules/**/*.{js,ts,jsx,tsx}",
    // Only the @medusajs/ui primitives this storefront actually imports.
    // Scanning all of dist/ generated utilities for the whole kit (Calendar,
    // DatePicker, Toast, CodeBlock...) and cost ~19 KB of unused CSS.
    // IMPORTANT: importing a new component from @medusajs/ui means adding it
    // here, otherwise its classes are never generated and it renders unstyled.
    "./node_modules/@medusajs/ui/dist/esm/components/badge/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/button/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/checkbox/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/container/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/divider/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/drawer/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/dropdown-menu/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/heading/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/icon-badge/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/icon-button/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/input/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/label/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/radio-group/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/select/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/status-badge/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/table/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/text/**/*.js",
    "./node_modules/@medusajs/ui/dist/esm/components/textarea/**/*.js",
  ],
  theme: {
    extend: {
      transitionProperty: {
        width: "width margin",
        height: "height",
        bg: "background-color",
        display: "display opacity",
        visibility: "visibility",
        padding: "padding-top padding-right padding-bottom padding-left",
      },
      colors: {
        grey: {
          0: "#FFFFFF",
          5: "#F9FAFB",
          10: "#F3F4F6",
          20: "#E5E7EB",
          30: "#D1D5DB",
          40: "#9CA3AF",
          50: "#6B7280",
          60: "#4B5563",
          70: "#374151",
          80: "#1F2937",
          90: "#111827",
        },
        // Error, success and warning, read from the three tokens every preset declares in both
        // modes (styles/themes.css). The `ui-tag-red/orange/green` ramps of the Medusa preset are
        // bridged to the preset's chart colours, so on supplements the "red" error banner was grey.
        // The text inks mix the status colour into the page ink until they clear 4.5:1 on their own
        // tint in every preset: a raw --warning is a light orange on geist (2.03:1 on white), so
        // warning icons take `warning-text` as well. `theme-colours.test.ts` re-measures all of it.
        status: {
          error: "var(--destructive)",
          "error-text": "color-mix(in srgb, var(--destructive) 75%, var(--foreground))",
          "error-bg": "color-mix(in srgb, var(--destructive) 8%, var(--background))",
          "error-border": "color-mix(in srgb, var(--destructive) 35%, var(--background))",
          success: "var(--success)",
          "success-text": "color-mix(in srgb, var(--success) 75%, var(--foreground))",
          "success-bg": "color-mix(in srgb, var(--success) 8%, var(--background))",
          "success-border": "color-mix(in srgb, var(--success) 35%, var(--background))",
          warning: "var(--warning)",
          "warning-text": "color-mix(in srgb, var(--warning) 55%, var(--foreground))",
          "warning-bg": "color-mix(in srgb, var(--warning) 8%, var(--background))",
          "warning-border": "color-mix(in srgb, var(--warning) 35%, var(--background))",
        },
      },
      borderRadius: {
        none: "0px",
        soft: "2px",
        base: "4px",
        rounded: "8px",
        large: "16px",
        circle: "9999px",
      },
      maxWidth: {
        "8xl": "100rem",
      },
      screens: {
        "2xsmall": "320px",
        xsmall: "512px",
        small: "1024px",
        medium: "1280px",
        large: "1440px",
        xlarge: "1680px",
        "2xlarge": "1920px",
      },
      fontSize: {
        "3xl": "2rem",
      },
      // The neutral focus ring of a form field, next to the preset's own `shadow-borders-*`.
      // The value lives in styles/globals.css, one per mode.
      boxShadow: {
        "borders-field-focus": "var(--borders-field-focus)",
        // The invalid field's ring in the preset's own --destructive (the preset's
        // `shadow-borders-error` is Medusa's fixed rose in every theme).
        "borders-field-error": "var(--borders-field-error)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Ubuntu",
          "sans-serif",
        ],
      },
      keyframes: {
        ring: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "fade-in-right": {
          "0%": {
            opacity: "0",
            transform: "translateX(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)",
          },
        },
        "fade-in-top": {
          "0%": {
            opacity: "0",
            transform: "translateY(-10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "fade-out-top": {
          "0%": {
            height: "100%",
          },
          "99%": {
            height: "0",
          },
          "100%": {
            visibility: "hidden",
          },
        },
        "accordion-slide-up": {
          "0%": {
            height: "var(--radix-accordion-content-height)",
            opacity: "1",
          },
          "100%": {
            height: "0",
            opacity: "0",
          },
        },
        "accordion-slide-down": {
          "0%": {
            "min-height": "0",
            "max-height": "0",
            opacity: "0",
          },
          "100%": {
            "min-height": "var(--radix-accordion-content-height)",
            "max-height": "none",
            opacity: "1",
          },
        },
        // Named `scale-enter`, not `enter`: the preset's tailwindcss-animate emits its own
        // `@keyframes enter` (the translate/scale/opacity one behind every
        // `data-[state=open]:animate-in`), and a second block of the same name replaced
        // its `transform`, so every drawer, menu and select opened as this 0.9 zoom and
        // no `slide-in-from-*` ever moved anything (t-2026-10-03-63).
        "scale-enter": {
          "0%": { transform: "scale(0.9)", opacity: 0 },
          "100%": { transform: "scale(1)", opacity: 1 },
        },
        leave: {
          "0%": { transform: "scale(1)", opacity: 1 },
          "100%": { transform: "scale(0.9)", opacity: 0 },
        },
        "slide-in": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        ring: "ring 2.2s cubic-bezier(0.5, 0, 0.5, 1) infinite",
        "fade-in-right":
          "fade-in-right 0.3s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "fade-in-top": "fade-in-top 0.2s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "fade-out-top":
          "fade-out-top 0.2s cubic-bezier(0.5, 0, 0.5, 1) forwards",
        "accordion-open":
          "accordion-slide-down 300ms cubic-bezier(0.87, 0, 0.13, 1) forwards",
        "accordion-close":
          "accordion-slide-up 300ms cubic-bezier(0.87, 0, 0.13, 1) forwards",
        enter: "scale-enter 200ms ease-out",
        "slide-in": "slide-in 1.2s cubic-bezier(.41,.73,.51,1.02)",
        leave: "leave 150ms ease-in forwards",
      },
    },
  },
  plugins: [require("tailwindcss-radix")()],
}
