// tenant-panel: placeholder, replaced by piece 3. Exports the same names the
// Admin's routes/products/product-list/index.ts exports (`Component`,
// `productLoader`, re-exported as `productLoader` from a `productsLoader`
// factory upstream) so app.tsx's route wiring does not change when piece 3
// overwrites this directory.
export { ProductListPlaceholder as Component } from "./product-list-placeholder"
export { productLoader } from "./product-list-placeholder"
