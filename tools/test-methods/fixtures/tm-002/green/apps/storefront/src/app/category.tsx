// Negative control for face B, part one: the owner's data is read, compared
// against a threshold, and NEVER handed over to a build-time source. Both
// branches return what this shop owns, so nothing the owner filled in can
// vanish. The file imports nothing from the build profile at all.
export default function CategoryPage({ category, categories }: Props) {
  const url = typeof category.metadata?.image_url === "string" ? category.metadata.image_url : null
  const { alt_text } = (category.metadata ?? {}) as Record<string, string>
  const own = categories.filter((c) => c.metadata?.image_url)

  if (own.length >= 3) {
    return <Grid tiles={own} columns={3} cover={url} alt={alt_text} />
  }

  return <Tiles tiles={own} cover={url} alt={alt_text} />
}
