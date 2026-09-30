/**
 * What a column is called where a log names it — the conflict log (G-2) and
 * the activity log (FR-32.2) name the same columns, so they name them once.
 */
import type { MessageKey } from '@/i18n'

/**
 * The column names a reader would recognise. Keyed by field alone, not by
 * table and field: a column of the same name means the same thing everywhere
 * in the schema. An unlisted field keeps its own name — a raw `image_hash`
 * says less than "Photo" but never says something untrue.
 */
export const FIELD_LABELS: Partial<Record<string, MessageKey>> = {
  name: 'conflicts.field.name',
  year: 'conflicts.field.year',
  start_date: 'conflicts.field.start_date',
  end_date: 'conflicts.field.end_date',
  status: 'conflicts.field.status',
  state: 'conflicts.field.state',
  mode: 'conflicts.field.mode',
  quantity: 'conflicts.field.quantity',
  packed_count: 'conflicts.field.packed_count',
  category_name: 'conflicts.field.category_name',
  weight_grams: 'conflicts.field.weight_grams',
  value_cents: 'conflicts.field.value_cents',
  icon: 'conflicts.field.icon',
  sort_order: 'conflicts.field.sort_order',
  late_packer: 'conflicts.field.late_packer',
  flag_unused: 'conflicts.field.flag_unused',
  flag_missing: 'conflicts.field.flag_missing',
  body: 'conflicts.field.body',
  is_task: 'conflicts.field.is_task',
  task_state: 'conflicts.field.task_state',
  assigned_traveler_id: 'conflicts.field.assigned_traveler_id',
  carrier_traveler_id: 'conflicts.field.carrier_traveler_id',
  container_id: 'conflicts.field.container_id',
  paired_container_id: 'conflicts.field.paired_container_id',
  source_item_id: 'conflicts.field.source_item_id',
  source_template_id: 'conflicts.field.source_template_id',
  series_id: 'conflicts.field.series_id',
  bought: 'conflicts.field.bought',
  list: 'conflicts.field.list',
  title: 'conflicts.field.title',
  due_date: 'conflicts.field.due_date',
}
