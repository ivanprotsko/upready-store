/**
 * Variant of the f12 class in the other app: an acceptance fixture ONLY, put
 * under the storefront's own src so the acceptance run could import it. The
 * storefront's build type-checks every file under src, so this one gates the
 * deploy exactly the way the backend fixture did.
 */
export const probeCart = { items: [{ id: "item_1", quantity: 1 }] };
