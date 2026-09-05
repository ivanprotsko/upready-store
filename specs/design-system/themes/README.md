# Theme presets

One file per preset, `<id>.theme.json`, validated against `../theme-preset.schema.json`
(`upready.theme-preset/v0`). Token names come from the canon dictionary `geist-kit/theme.css`;
values come from the `source` named inside each file. The storefront build script compiles these
files into `apps/storefront/src/styles/themes.css` (`[data-theme="<id>"][data-mode="<mode>"]`).
Decision and acceptance: `docs/design-system/00-program-2026-09-06.md` §11. Generated presets from
`@ivanprotsko-org/theme-configurator` import into the same `modes.*.tokens` shape.
