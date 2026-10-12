# Theme presets

One file per preset, `<id>.theme.json`, validated against `../theme-preset.schema.json`
(`upready.theme-preset/v0`). Token names come from the canon dictionary `geist-kit/theme.css`;
values come from the `source` named inside each file. The storefront build script compiles these
files into `apps/storefront/src/styles/themes.css` (`[data-theme="<id>"][data-mode="<mode>"]`).
Decision and acceptance: `docs/design-system/00-program-2026-09-06.md` §11. Generated presets from
`@ivanprotsko-org/theme-configurator` import into the same `modes.*.tokens` shape.

A preset may leave `modes.dark` out. It is then light only: `pnpm themes:build` paints its light tokens under
both `data-mode` values, keeps Medusa's dark-only bridge rows off it, and lists it in `LIGHT_ONLY_THEME_IDS`
instead of `THEME_IDS`, so no shop picker offers it next to a mode switch. The seven palettes of the 16.09
templates lab (`ferma`, `interier`, `katalog`, `lending`, `moda`, `opt`, `uhod`) are written that way for the
store templates (`docs/templates/BLOCK-CONTRACT.md`).
