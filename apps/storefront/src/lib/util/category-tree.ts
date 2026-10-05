type TreeNode = { id: string; category_children?: { id: string }[] | null }

/**
 * A category's id and the id of everything under it, at any depth, out of the shop's flat
 * category list (ask a0e1: a shop with three levels of categories). A parent's page lists
 * the products of the whole branch, not of its direct children only.
 */
export function categoryBranchIds(rootId: string, categories: readonly TreeNode[]): string[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const ids: string[] = []
  const seen = new Set<string>()
  const queue = [rootId]

  while (queue.length) {
    const id = queue.shift() as string

    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    ids.push(id)
    for (const child of byId.get(id)?.category_children ?? []) {
      queue.push(child.id)
    }
  }

  return ids
}
