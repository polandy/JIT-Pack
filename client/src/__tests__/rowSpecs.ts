/**
 * Every table's spec, composed as the running app composes them: the kernel's
 * and each feature module's (ADR-066 amendment 2). Production never needs the
 * whole — each store carries its own on its sinks — so only the specs that
 * hold the registry against the wire and the schema assemble it.
 */
import { MEAL_ROWS } from '@/meals/rows'
import { PLANNER_ROWS } from '@/planner/rows'
import { SHOPPING_ROWS } from '@/shopping/rows'
import { KERNEL_TABLE_SPECS, type RowSpec } from '@/sync/tableRegistry'

/** Each module's specs, by module — what `moduleRows.spec.ts` holds apart from the kernel's. */
export const MODULE_ROW_SPECS = { shopping: SHOPPING_ROWS, planner: PLANNER_ROWS, meals: MEAL_ROWS }

/** Every table's spec, kernel and modules together. */
export const ALL_ROW_SPECS: Readonly<Record<string, RowSpec>> = Object.assign(
  {},
  KERNEL_TABLE_SPECS,
  ...Object.values(MODULE_ROW_SPECS),
)

/** The source files that declare a codec, for the specs that read their functions by name. */
export const CODEC_SOURCES = [
  '../sync/tableRegistry.ts',
  '../sync/rows.ts',
  '../shopping/rows.ts',
  '../planner/rows.ts',
  '../meals/rows.ts',
]
