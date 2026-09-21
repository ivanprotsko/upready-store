import { Outlet } from "react-router-dom"
import { JsonViewSection } from "../../../common/json-view-section"
import { MetadataSection } from "../../../common/metadata-section"
import { PageProps } from "../types"

export const SingleColumnPage = <TData,>({
  children,
  widgets,
  /**
   * Data of the page which is passed to Widgets, JSON view, and Metadata view.
   */
  data,
  /**
   * Whether the page should render an outlet for children routes. Defaults to true.
   */
  hasOutlet = true,
  /**
   * Whether to show JSON view of the data. Defaults to false.
   */
  showJSON,
  /**
   * Whether to show metadata view of the data. Defaults to false.
   */
  showMetadata,
}: PageProps<TData>) => {
  const { before, after } = widgets
  const widgetProps = { data }

  // o21-owner-panel-ux (P3): the owner's panel never shows the «Метаданные» and
  // «JSON» cards. They are the record as the database keeps it, and no job of
  // hers needs them. The props stay, so the copied screens need no edits.
  showJSON = false
  showMetadata = false

  if (showJSON && !data) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "`showJSON` is true but no data is provided. To display JSON, provide data prop."
      )
    }

    showJSON = false
  }

  if (showMetadata && !data) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "`showMetadata` is true but no data is provided. To display metadata, provide data prop."
      )
    }

    showMetadata = false
  }

  return (
    <div className="flex flex-col gap-y-3">
      {before.map((Component, i) => {
        return <Component {...widgetProps} key={i} />
      })}
      {children}
      {after.map((Component, i) => {
        return <Component {...widgetProps} key={i} />
      })}
      {showMetadata && <MetadataSection data={data!} />}
      {showJSON && <JsonViewSection data={data!} />}
      {hasOutlet && <Outlet />}
    </div>
  )
}
