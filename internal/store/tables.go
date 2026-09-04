// Package store — tables.go is the one place a syncable table is declared.
//
// Per-table knowledge used to live in five registries plus two switches,
// spread over two files: the push whitelist, the two partition sets, the
// FR-24.3 lifecycle set, the blocking references and the cascade switch. A
// table added to four of them and missed in the fifth is not a build error —
// it is a rule that silently does not apply, which is the failure
// CODING_PRINCIPLES §4a was written after. Since G-2's second half the
// master pull's visibility filter, the NFR-4.5 backup's query list and the
// API layer's mark whitelist are declared here too. They are all views
// derived from one `tableSpecs` map, and `tables_test.go` refuses a `Table*`
// constant without an entry.
package store

import "sort"

// partitionKind names which sync partition carries a table (Sync-API P-3).
// A mutation is only valid on its own partition's endpoint, or changes
// would leak into the wrong change feed.
type partitionKind int

const (
	// partitionTrip is one trip's feed: rows that are only ever read beside
	// the trip they belong to.
	partitionTrip partitionKind = iota + 1
	// partitionMaster is the instance-wide feed.
	partitionMaster
)

// blockingReference is one child column that refuses its parent's delete,
// i.e. a foreign key deliberately declared without ON DELETE.
type blockingReference struct {
	table  string
	column string
}

// childQuery names one child table and the query that finds its rows for a
// parent id. `?1` may repeat — an include hangs off both of its endpoints.
type childQuery struct{ table, query string }

// visibilityRule decides who may pull one row of a master-partition table
// (Sync-API §4). It is a value rather than a switch arm so that the answer
// for a table is readable beside the table's other rules; exactly one of the
// three fields is set, which `tables_test.go` asserts.
type visibilityRule struct {
	// everyone marks the instance-wide master data (FR-1.6 MVP
	// simplification, 2026-08-08 — everybody sees everything).
	everyone bool
	// tripQuery resolves the row's trip id, and every member of that trip
	// may see the row. A missing row denies: its tombstone follows in the
	// feed, and a tombstone carries only the entity id.
	tripQuery string
	// ownerQuery resolves the row's owning user; nobody else sees it.
	ownerQuery string
}

// exportQuery is how the NFR-4.5 full export selects one table's rows.
// scoped queries take the requesting user's id as their single argument;
// unscoped ones are the instance-wide master data every user may pull
// anyway, so filtering them would drop rows the caller can see.
type exportQuery struct {
	query  string
	scoped bool
}

// tableSpec is everything the sync layer knows about one table. A field left
// zero is a statement — no cascade, nothing that blocks a delete, not
// retirable — and the completeness test is what keeps it a deliberate one.
type tableSpec struct {
	// partition is the feed the table's changes travel on.
	partition partitionKind
	// columns whitelists what a push may touch; everything else is rejected
	// before any SQL is built.
	columns map[string]bool
	// retirable marks the tables FR-24.3 governs: a blocked delete keeps the
	// row and stamps RetiredColumn instead of refusing.
	retirable bool
	// blockedBy lists the child columns that refuse this row's delete, i.e.
	// the foreign keys deliberately declared without ON DELETE. Only the
	// restricting ones belong here — a reference declared ON DELETE CASCADE
	// takes the child with the parent and blocks nothing, and that is what
	// cascades is.
	//
	// It exists so the refusal can be *asked for* instead of inferred from a
	// driver error string, which is not a stable contract across driver
	// versions.
	blockedBy []blockingReference
	// cascades names the child rows an FK cascade will delete, in the order
	// their tombstones must be emitted: a child before the parent it hangs
	// off, always.
	cascades []childQuery
	// visible is the master pull's filter for this table, and is set on
	// master-partition tables alone: the trip partition's whole gate is
	// membership in the trip whose endpoint was called, applied before the
	// feed is read at all.
	visible visibilityRule
	// export selects the table's rows for the NFR-4.5 backup. Every
	// syncable table has one — a backup is a promise about everything the
	// caller can see, and a table left out of it is data that survives no
	// disaster.
	export exportQuery
}

// tableSpecs declares every syncable table. The maps and lookups below are
// views of it; nothing else may be keyed by table name.
var tableSpecs = map[string]tableSpec{
	// --- master partition ---------------------------------------------

	// Renamed from `categories` by migration 022 (ADR-014): an item carries
	// a set of these, not one of them.
	TableTags: {
		partition: partitionMaster,
		columns:   toSet("name", "sort_order"),
		visible:   visibilityRule{everyone: true},
		export:    exportQuery{query: `SELECT * FROM tags`},
		// A deleted tag unassigns itself everywhere (FR-24.1). Without the
		// tombstones a client keeps grouping items under a heading the
		// server no longer has.
		cascades: []childQuery{
			{TableItemTags, `SELECT id FROM item_tags WHERE tag_id = ?`},
		},
	},

	// One assignment per row so each merges on its own (NFR-4.2a); a JSON
	// set on the item would be a single field and lose one of two
	// concurrent edits. position 0 is the primary tag (FR-24.2).
	TableItemTags: {
		partition: partitionMaster,
		columns:   toSet("item_id", "tag_id", "position"),
		visible:   visibilityRule{everyone: true},
		// The assignments travel with the items in the backup too — an item
		// restored without them is untagged and vanishes from every M9
		// grouping.
		export: exportQuery{query: `SELECT * FROM item_tags`},
	},

	// category_id is gone with FR-24.1 (migration 022) — a client still
	// sending it is rejected rather than silently ignored.
	TableItems: {
		partition: partitionMaster,
		columns: toSet(
			"name", "weight_grams", "value_cents",
			"created_by",
			"image_hash",
			MarkColumn,
			RetiredColumn,
		),
		retirable: true,
		blockedBy: []blockingReference{
			{TableTemplateItems, "item_id"},
			{TableTripItems, "source_item_id"},
		},
		visible: visibilityRule{everyone: true},
		export:  exportQuery{query: `SELECT * FROM items`},
		cascades: []childQuery{
			{TableItemTags, `SELECT id FROM item_tags WHERE item_id = ?`},
			{TableItemDependencies,
				`SELECT id FROM item_dependencies WHERE item_id = ?1 OR depends_on_item_id = ?1`},
		},
	},

	TableItemDependencies: {
		partition: partitionMaster,
		columns:   toSet("item_id", "depends_on_item_id", "mode", "quantity"),
		visible:   visibilityRule{everyone: true},
		export:    exportQuery{query: `SELECT * FROM item_dependencies`},
	},

	// is_published stays in the schema but off this list: the publish gate
	// is parked with the FR-1.6 MVP simplification (templates are shared
	// instance-wide), and an unreadable column no client can set is the
	// honest state until the stub's revisit trigger fires.
	TableTemplates: {
		partition: partitionMaster,
		columns:   toSet("owner_id", "name", "kind", MarkColumn, RetiredColumn),
		retirable: true,
		// Instance-wide like the master items they are built from, so they
		// export unfiltered as well (FR-1.6 MVP).
		visible: visibilityRule{everyone: true},
		export:  exportQuery{query: `SELECT * FROM templates`},
		// FR-9.2: an archived trip keeps naming the Vorlage its rows came
		// from, so the Vorlage cannot be deleted while any trip item names it.
		blockedBy: []blockingReference{
			{TableTripItems, "source_template_id"},
		},
		cascades: []childQuery{
			// Leaf-first: the position tasks (FR-27.7) hang off the
			// positions, which hang off the template, and the group
			// includes (FR-27.1) vanish from both sides of the relation.
			{TableTemplateItemTasks, `SELECT t.id FROM template_item_tasks t
			 JOIN template_items ti ON ti.id = t.template_item_id WHERE ti.template_id = ?`},
			{TableTemplateItems, `SELECT id FROM template_items WHERE template_id = ?`},
			{TableTemplateIncludes,
				`SELECT id FROM template_includes WHERE template_id = ?1 OR included_template_id = ?1`},
			// FR-27.4: a deleted template stops being a trip's source.
			// Without the tombstone a client keeps re-resolving a group the
			// server no longer has and reports its positions as removed on
			// every open.
			{TableTripTemplateSources, `SELECT id FROM trip_template_sources WHERE template_id = ?`},
		},
	},

	TableTemplateItems: {
		partition: partitionMaster,
		columns: toSet(
			"template_id", "item_id", "quantity", "assignment",
			"dedup", "conditions", "default_mode", "late_packer",
		),
		visible: visibilityRule{everyone: true},
		export:  exportQuery{query: `SELECT * FROM template_items`},
		cascades: []childQuery{
			{TableTemplateItemTasks, `SELECT id FROM template_item_tasks WHERE template_item_id = ?`},
		},
	},

	TableTemplateIncludes: {
		partition: partitionMaster,
		columns:   toSet("template_id", "included_template_id"),
		visible:   visibilityRule{everyone: true},
		export:    exportQuery{query: `SELECT * FROM template_includes`},
	},

	TableTemplateItemTasks: {
		partition: partitionMaster,
		columns:   toSet("template_item_id", "task"),
		visible:   visibilityRule{everyone: true},
		export:    exportQuery{query: `SELECT * FROM template_item_tasks`},
	},

	TableTripSeries: {
		partition: partitionMaster,
		columns:   toSet("owner_id", "name", "default_attributes"),
		visible:   visibilityRule{ownerQuery: `SELECT owner_id FROM trip_series WHERE id = ?`},
		export:    exportQuery{query: `SELECT * FROM trip_series WHERE owner_id = ?`, scoped: true},
		blockedBy: []blockingReference{
			{TableTrips, "series_id"},
		},
		cascades: []childQuery{
			{TableDestinationChecklistItems, `SELECT ci.id FROM destination_checklist_items ci
			 JOIN destination_profiles p ON p.id = ci.profile_id WHERE p.series_id = ?`},
			{TableDestinationProfiles, `SELECT id FROM destination_profiles WHERE series_id = ?`},
		},
	},

	TableDestinationProfiles: {
		partition: partitionMaster,
		columns:   toSet("series_id", "notes"),
		// Ownership follows the series chain (FR-13.2), for reading as for
		// writing.
		visible: visibilityRule{ownerQuery: `SELECT s.owner_id FROM destination_profiles p
			 JOIN trip_series s ON s.id = p.series_id WHERE p.id = ?`},
		export: exportQuery{query: `SELECT p.* FROM destination_profiles p
			JOIN trip_series s ON s.id = p.series_id WHERE s.owner_id = ?`, scoped: true},
		cascades: []childQuery{
			{TableDestinationChecklistItems, `SELECT id FROM destination_checklist_items WHERE profile_id = ?`},
		},
	},

	TableDestinationChecklistItems: {
		partition: partitionMaster,
		columns:   toSet("profile_id", "label", "mode"),
		visible: visibilityRule{ownerQuery: `SELECT s.owner_id FROM destination_checklist_items ci
			 JOIN destination_profiles p ON p.id = ci.profile_id
			 JOIN trip_series s ON s.id = p.series_id WHERE ci.id = ?`},
		export: exportQuery{query: `SELECT ci.* FROM destination_checklist_items ci
			JOIN destination_profiles p ON p.id = ci.profile_id
			JOIN trip_series s ON s.id = p.series_id WHERE s.owner_id = ?`, scoped: true},
	},

	TableTrips: {
		partition: partitionMaster,
		columns: toSet(
			"series_id", "name", "year", "start_date", "end_date", "status",
			"attributes", "imported", "created_by",
		),
		visible: visibilityRule{tripQuery: `SELECT id FROM trips WHERE id = ?`},
		export: exportQuery{query: `SELECT t.* FROM trips t
			JOIN trip_members m ON m.trip_id = t.id WHERE m.user_id = ?`, scoped: true},
		// A deleted trip takes three master-partition tables with it. They
		// need tombstones of their own precisely because the trip's *other*
		// children cannot have any: change_log.trip_id cascades too, so the
		// trip partition's whole feed is deleted with the row it describes,
		// and only the master feed survives to carry the news.
		cascades: []childQuery{
			{TableTripMembers, `SELECT id FROM trip_members WHERE trip_id = ?`},
			{TableTripTemplateSources, `SELECT id FROM trip_template_sources WHERE trip_id = ?`},
			{TableTripAppliedChanges, `SELECT id FROM trip_applied_changes WHERE trip_id = ?`},
		},
	},

	TableTripMembers: {
		partition: partitionMaster,
		columns:   toSet("trip_id", "user_id", "role"),
		// The roster is visible to every member of its trip — including the
		// row's subject, who becomes a member through this very row.
		visible: visibilityRule{tripQuery: `SELECT trip_id FROM trip_members WHERE id = ?`},
		// It is in the backup for the same reason it is in the feed: a trip
		// restored without its roster is a trip nobody owns. The users it
		// points at are not exported — identity belongs to the IdP.
		export: exportQuery{query: `SELECT x.* FROM trip_members x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// trip_template_sources and trip_applied_changes are trip-scoped but
	// travel the *master* partition, like trip_members: M2 renders the
	// FR-27.4 chip and M8 its blast-radius note without any trip partition
	// being loaded.
	//
	// FR-27.4: which templates a planning trip follows. Registered by
	// generation, read by the refresh diff and by M8's blast-radius note.
	TableTripTemplateSources: {
		partition: partitionMaster,
		columns:   toSet("trip_id", "template_id"),
		visible:   visibilityRule{tripQuery: `SELECT trip_id FROM trip_template_sources WHERE id = ?`},
		// FR-27.4: a restore without this would leave a planning trip
		// following nothing.
		export: exportQuery{query: `SELECT x.* FROM trip_template_sources x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-27.4: the log behind M2's applied-changes chip. created_at is
	// client-set: the entry records when the *client* applied the change,
	// which is the only device that knows — the server never runs the diff.
	TableTripAppliedChanges: {
		partition: partitionMaster,
		columns: toSet(
			"trip_id", "source_template_id", "source_template_name",
			"kind", "item_name", "detail", "created_at",
		),
		visible: visibilityRule{tripQuery: `SELECT trip_id FROM trip_applied_changes WHERE id = ?`},
		// FR-27.4: without the log a restored trip follows its groups with
		// no record of what it already produced, which reads every existing
		// row as a manual edit and every position as new.
		export: exportQuery{query: `SELECT x.* FROM trip_applied_changes x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// --- trip partition -----------------------------------------------

	TableTripItems: {
		partition: partitionTrip,
		columns: toSet(
			"trip_id", "source_item_id", "source_template_id", "name",
			"weight_grams", "value_cents", "category_name", "quantity",
			"packed_count", "state", "mode", "late_packer",
			// FR-25.11j: the list the row was bought from. A client-chosen
			// value like packer_user_id beside it — it records a decision the
			// person made, not an identity claim, so stampActor leaves it alone.
			"bought_from",
			"assigned_traveler_id", "packer_user_id", "container_id",
			"packing_now_by", "packing_now_at", "flag_unused", "flag_missing",
			"outbound_packed",
			// Listed so the server's own stamp can be persisted through the
			// push path; stampActor discards any client-sent value first
			// (FR-25.19, invariant 3). packed_at is the same record's time
			// (FR-25.17) and goes through the same gate.
			"packed_by_user_id", "packed_at",
		),
		// The one cascade of the *trip* partition: a row's comments and
		// FR-7.3 todos hang off it (comments.trip_item_id ON DELETE
		// CASCADE). Trip-level comments have a NULL trip_item_id and are
		// untouched by the delete, so the query names the row explicitly
		// rather than matching on the trip.
		cascades: []childQuery{
			{TableComments, `SELECT id FROM comments WHERE trip_item_id = ?`},
		},
		export: exportQuery{query: `SELECT x.* FROM trip_items x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// profile is gone with FR-25.9 (migration 018) — a client still
	// sending it is rejected rather than silently ignored.
	TableTravelers: {
		partition: partitionTrip,
		columns:   toSet("trip_id", "name", "linked_user_id"),
		export: exportQuery{query: `SELECT x.* FROM travelers x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
		blockedBy: []blockingReference{
			{TableTripItems, "assigned_traveler_id"},
			{TableContainers, "carrier_traveler_id"},
		},
	},

	TableContainers: {
		partition: partitionTrip,
		columns: toSet(
			"trip_id", "name", "carrier_traveler_id", "max_weight_grams",
			"paired_container_id",
		),
		export: exportQuery{query: `SELECT x.* FROM containers x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
		blockedBy: []blockingReference{
			{TableTripItems, "container_id"},
			{TableContainers, "paired_container_id"},
		},
	},

	TableComments: {
		partition: partitionTrip,
		columns: toSet(
			"trip_id", "trip_item_id", "author_id", "body",
			"is_task", "task_state",
		),
		export: exportQuery{query: `SELECT x.* FROM comments x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// trip_generated_positions is trip-partition state: it is only ever read
	// beside the rows it describes, and it should travel with them.
	//
	// FR-27.4: what generation last produced per position — the record that
	// lets the refresh tell a manual edit from its own previous work.
	TableTripGeneratedPositions: {
		partition: partitionTrip,
		columns: toSet(
			"trip_id", "trip_item_id", "source_template_id", "source_item_id",
			"traveler_id", "name", "quantity", "mode", "late_packer",
			"weight_grams", "value_cents", "category_name", "tasks",
		),
		export: exportQuery{query: `SELECT x.* FROM trip_generated_positions x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},
}

// The views. Each is derived once at start-up from tableSpecs, so a table
// can no longer be in one and missing from another.
var (
	// syncableColumns whitelists the tables and columns the push endpoints
	// may touch; everything else is rejected before any SQL is built.
	syncableColumns = derivedColumns()
	// tripPartitionTables and masterPartitionTables are the entity sets each
	// push endpoint accepts (Sync-API P-3).
	tripPartitionTables   = derivedPartition(partitionTrip)
	masterPartitionTables = derivedPartition(partitionMaster)
	// lifecycleTables names the entities FR-24.3 governs. Everything else
	// with a blocking reference — a series, a traveler, a container — keeps
	// refusing its delete: those are not history the way a master item is,
	// and a retired traveler would be a person nobody can see attached to
	// rows everybody can.
	lifecycleTables = derivedRetirable()
	// blockingReferences lists, per deletable table, the references that
	// keep a row alive.
	blockingReferences = derivedBlockers()
)

// TableHasMark reports whether table carries the FR-28.1 item mark. The API
// layer asks rather than keeping a second list: the mark is a column, and
// which tables have it is already stated once, above.
func TableHasMark(table string) bool {
	return tableSpecs[table].columns[MarkColumn]
}

// exportTables returns the NFR-4.5 backup's tables in a stable order, so a
// failing export names the same table on every run.
func exportTables() []string {
	out := make([]string, 0, len(tableSpecs))
	for table := range tableSpecs {
		out = append(out, table)
	}
	sort.Strings(out)
	return out
}

func derivedColumns() map[string]map[string]bool {
	out := make(map[string]map[string]bool, len(tableSpecs))
	for table, spec := range tableSpecs {
		out[table] = spec.columns
	}
	return out
}

func derivedPartition(kind partitionKind) map[string]bool {
	out := map[string]bool{}
	for table, spec := range tableSpecs {
		if spec.partition == kind {
			out[table] = true
		}
	}
	return out
}

func derivedRetirable() map[string]bool {
	out := map[string]bool{}
	for table, spec := range tableSpecs {
		if spec.retirable {
			out[table] = true
		}
	}
	return out
}

func derivedBlockers() map[string][]blockingReference {
	out := map[string][]blockingReference{}
	for table, spec := range tableSpecs {
		if len(spec.blockedBy) > 0 {
			out[table] = spec.blockedBy
		}
	}
	return out
}
