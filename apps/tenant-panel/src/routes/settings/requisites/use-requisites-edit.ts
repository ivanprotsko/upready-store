import { useRequisites, useUpdateRequisites } from "../../../hooks/api/requisites"
import { type RequisitesDraft, toDraft } from "./requisites-model"

// One record, one mutation: a section drawer shows only its own fields, but the
// body it sends is the whole record with those fields replaced, as the single
// form on this page used to send it.
export const useRequisitesEdit = () => {
  const { requisites, isPending, isError, error } = useRequisites()
  const { mutateAsync } = useUpdateRequisites()

  if (isError) {
    throw error
  }

  const saved = toDraft(requisites)

  const save = (values: Partial<RequisitesDraft>) => mutateAsync({ ...saved, ...values })

  return { saved, isPending, save }
}
