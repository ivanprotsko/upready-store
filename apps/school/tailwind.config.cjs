/**
 * The shop's look, so a buyer coming from cherkashino.ru sees one brand: the
 * colours are the `supplements` preset the shop runs on
 * (apps/storefront/src/styles/themes.css, light mode), read from the CSS
 * variables `app/app.css` declares, and the type is Inter, the face the
 * shop's own header and account use.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        border: "var(--border)",
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          hover: "color-mix(in srgb, var(--primary) 88%, #000)",
          tint: "color-mix(in srgb, var(--primary) 10%, var(--background))",
        },
        link: "var(--link)",
        ring: "var(--ring)",
        destructive: {
          DEFAULT: "var(--destructive)",
          text: "color-mix(in srgb, var(--destructive) 75%, var(--foreground))",
          bg: "color-mix(in srgb, var(--destructive) 8%, var(--background))",
          border: "color-mix(in srgb, var(--destructive) 35%, var(--background))",
        },
        success: {
          DEFAULT: "var(--success)",
          text: "color-mix(in srgb, var(--success) 75%, var(--foreground))",
          bg: "color-mix(in srgb, var(--success) 8%, var(--background))",
          border: "color-mix(in srgb, var(--success) 35%, var(--background))",
        },
        warning: {
          text: "color-mix(in srgb, var(--warning) 55%, var(--foreground))",
          bg: "color-mix(in srgb, var(--warning) 8%, var(--background))",
          border: "color-mix(in srgb, var(--warning) 35%, var(--background))",
        },
      },
      borderRadius: {
        theme: "var(--radius)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      maxWidth: {
        measure: "70ch",
      },
    },
  },
  plugins: [],
}
