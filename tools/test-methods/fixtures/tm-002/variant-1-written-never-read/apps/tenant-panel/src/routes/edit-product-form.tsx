// Variant of the f16 class, face A: the owner is given a field, the value is
// persisted on the product's metadata, and nothing in the storefront, the
// backend or the panel ever reads it back.
export function EditProductForm({ product }: { product: Product }) {
  const save = (values: Values) =>
    update({
      title: values.title,
      metadata: { ...product.metadata, badge_text: values.badgeText },
    })
  return <Form onSubmit={save} />
}
