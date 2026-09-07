/**
 * The one module that owns the look's switchable axes: attribute names, storage keys,
 * allow-lists, the pre-paint script, the runtime apply() calls, the profile defaults
 * and the font contract. Everything else imports from here.
 */

export { AXES, axis, isAllowed, type AxisAttr, type ThemeAxis } from "./attributes"
export { themePrePaintScript } from "./pre-paint"
export { readProfileTheme, readProfileFonts, type ProfileTheme } from "./profile"
export {
  FONT_NAMES,
  FONT_LOADERS,
  FONT_VARIABLES,
  FONT_STATIC_WEIGHTS,
  isFontName,
  assertFontName,
  type FontName,
} from "./fonts"
export { THEME_IDS, THEME_MODES, THEME_LABELS, THEME_TOKEN_COUNT, type ThemeId, type ThemeMode } from "./presets.generated"
export { fontClassName, activeFonts } from "./fonts.generated"
