import { RefObject, useEffect, useRef } from "react"

import { DataGridQueryTool } from "../models"

// tenant-panel: `| null` added, @types/react 18 vs 19 skew, see data-grid/types.ts.
export const useDataGridQueryTool = (containerRef: RefObject<HTMLElement | null>) => {
  const queryToolRef = useRef<DataGridQueryTool | null>(null)

  useEffect(() => {
    if (containerRef.current) {
      queryToolRef.current = new DataGridQueryTool(containerRef.current)
    }
  }, [containerRef])

  return queryToolRef.current
}
