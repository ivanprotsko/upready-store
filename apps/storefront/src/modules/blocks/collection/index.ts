/**
 * The `collection/*` blocks of the registry (BLOCK-CONTRACT.md §1): one line per block, in path order,
 * `export { <entry> } from "./<variant>/block"`. `../registry.ts` takes every export of this
 * file, sorts it by variant and puts the category where `BLOCK_CATEGORIES` says.
 */
export { bundle } from "./bundle/block"
export { featured } from "./featured/block"
export { tabs } from "./tabs/block"
