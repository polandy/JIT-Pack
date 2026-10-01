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
  name: 'fieldLabel.name',
  year: 'fieldLabel.year',
  start_date: 'fieldLabel.start_date',
  end_date: 'fieldLabel.end_date',
  status: 'fieldLabel.status',
  state: 'fieldLabel.state',
  mode: 'fieldLabel.mode',
  quantity: 'fieldLabel.quantity',
  packed_count: 'fieldLabel.packed_count',
  category_name: 'fieldLabel.category_name',
  weight_grams: 'fieldLabel.weight_grams',
  value_cents: 'fieldLabel.value_cents',
  icon: 'fieldLabel.icon',
  sort_order: 'fieldLabel.sort_order',
  late_packer: 'fieldLabel.late_packer',
  flag_unused: 'fieldLabel.flag_unused',
  flag_missing: 'fieldLabel.flag_missing',
  body: 'fieldLabel.body',
  is_task: 'fieldLabel.is_task',
  task_state: 'fieldLabel.task_state',
  assigned_traveler_id: 'fieldLabel.assigned_traveler_id',
  carrier_traveler_id: 'fieldLabel.carrier_traveler_id',
  container_id: 'fieldLabel.container_id',
  paired_container_id: 'fieldLabel.paired_container_id',
  source_item_id: 'fieldLabel.source_item_id',
  source_template_id: 'fieldLabel.source_template_id',
  series_id: 'fieldLabel.series_id',
  bought: 'fieldLabel.bought',
  list: 'fieldLabel.list',
  title: 'fieldLabel.title',
  due_date: 'fieldLabel.due_date',
}
