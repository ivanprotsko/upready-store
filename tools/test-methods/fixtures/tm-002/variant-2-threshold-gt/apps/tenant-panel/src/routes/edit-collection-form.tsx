export function EditCollectionForm({ collection }: { collection: Collection }) {
  return (
    <Form
      onSubmit={(values) =>
        update({ metadata: { ...collection.metadata, banner_url: values.bannerUrl } })
      }
    />
  )
}
