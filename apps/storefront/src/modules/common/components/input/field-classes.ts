/**
 * The look of a form field, shared by every field the storefront draws itself.
 *
 * Ivan, 04.10 (ask-20261004-090510-c687), on the checkout address form: «нужно привести поля к
 * стилю medusjs ui и убрать этот зеленый оттенок в полях и везде где он используется». So the
 * surface is the one @medusajs/ui's own `Input`, `Select` and `Textarea` paint (`inputBaseStyles`
 * in @medusajs/ui 4.2.1): the field background, a hairline drawn as `shadow-borders-base` rather
 * than a border in the preset's border colour, and a 6px corner. The focus ring is Medusa's shape
 * in no hue (`--borders-field-focus` in styles/globals.css), neither Medusa's blue nor the shop's
 * brand colour.
 */
export const FIELD_SURFACE =
  "bg-ui-bg-field hover:bg-ui-bg-field-hover shadow-borders-base rounded-md transition-fg"

/** The focus ring of a field that takes the focus itself. */
export const FIELD_FOCUS =
  "outline-none focus:shadow-borders-field-focus aria-[invalid=true]:!shadow-borders-field-error"

/**
 * The same ring on a box that wraps a bare input (a search row with an icon, a select under its
 * own label): the box rings while anything inside it has the focus.
 */
export const FIELD_FOCUS_WITHIN = "focus-within:shadow-borders-field-focus"
