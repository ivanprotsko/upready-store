// Variant of the f16 class, face A, written as a subscript assignment rather
// than an object literal: the key still reaches the database and still has no
// reader anywhere.
export function EditPageForm({ page }: { page: Page }) {
  const save = (values: Values) => {
    const metadata = { ...page.metadata }
    metadata["promo_note"] = values.promoNote
    return update({ metadata })
  }
  return <Form onSubmit={save} />
}
