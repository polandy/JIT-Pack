/** One offer inside a facet — already worded and counted by the caller. */
export interface FilterOption {
  value: string
  label: string
  count: number
  selected: boolean
}

export interface FilterFacet {
  key: string
  label: string
  /** An `ionicons` import: the axis is recognised by its glyph before its word. */
  icon: string
  options: FilterOption[]
}

/** A switch that hides a whole class of rows (FR-25.11i, FR-25.20). */
export interface FilterSwitch {
  key: string
  label: string
  hint: string
  on: boolean
  count: number
}

export interface GroupingOption {
  value: string
  label: string
  icon: string
}
