/**
 * The tenant CSV exports (`POST /tenants/orders/export`,
 * `POST /tenants/customers/export`) answer with the file itself: a `text/csv`
 * attachment whose name is in `content-disposition` and whose row count is in
 * `x-export-count`. They hold buyers' personal data, so the file never gets a
 * URL of its own (audit 2026-09-23, A-01/A-02): it is read inside the panel's
 * authenticated fetch and saved from the browser.
 */
export type CsvExport = { filename: string; text: string; count: number }

export const readCsvExport = async (
  response: Response,
  fallbackFilename: string
): Promise<CsvExport> => {
  const text = await response.text()
  const disposition = response.headers.get("content-disposition") ?? ""
  const match = disposition.match(/filename="([^"]+)"/)

  return {
    filename: match?.[1] ?? fallbackFilename,
    text,
    count: Number(response.headers.get("x-export-count") ?? 0),
  }
}

/** Saves the CSV through a blob link, the way the catalogue export does. */
export const saveCsv = ({ filename, text }: Pick<CsvExport, "filename" | "text">) => {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
