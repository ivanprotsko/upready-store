/**
 * The `hero/*` blocks of the registry (BLOCK-CONTRACT.md §1): one line per block, in path order,
 * `export { <entry> } from "./<variant>/block"`. `../registry.ts` takes every export of this
 * file, sorts it by variant and puts the category where `BLOCK_CATEGORIES` says.
 *
 * The composition's own `hero` variants stay in `../existing.ts`, registered by reference;
 * this file holds the `hero/*` variants written for templates.
 */
export {}
