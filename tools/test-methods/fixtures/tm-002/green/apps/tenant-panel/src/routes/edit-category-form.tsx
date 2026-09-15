// Negative control for face A. Three keys, three legitimate readers, three
// shapes of read: a property access on the storefront, a string subscript on
// the backend, and a destructuring in the panel itself.
export function EditCategoryForm({ category }: { category: Category }) {
  const { alt_text } = (category.metadata ?? {}) as Record<string, string>
  return (
    <Form
      defaultAlt={alt_text}
      onSubmit={(values) =>
        update({
          metadata: {
            ...category.metadata,
            image_url: values.imageUrl,
            alt_text: values.altText,
            email_locale: values.locale,
          },
        })
      }
    />
  )
}
