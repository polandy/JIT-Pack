package store

// tableSpecs declares every syncable table — its columns, which partition
// it syncs on, who may write it and who may see it. wiregen (ADR-026) reads
// this var as a single bare map literal, so it stays whole in its own file
// while tables.go keeps the types, the derived views and their helpers.
var tableSpecs = map[string]tableSpec{
	// --- master partition ---------------------------------------------

	// An item carries a set of these, not one of them (ADR-014).
	// FR-7.8: the tags a task can carry — their own list, so that „what an
	// item is" and „what a task is about" never have to be the same word.
	// Master data like `tags`: instance-wide, every account may add one, and
	// in Single-User and Local Mode there is nobody else to disagree.
	TableTaskTags: {
		partition: partitionMaster,
		guard:     unguarded, // shared master data like `tags`: created in the picker by typing a word
		label:     activityLabel{name: own("name")},
		columns:   toSet("name", "sort_order", MarkColumn),
		visible:   visibilityRule{everyone: true},
		export:    exportQuery{query: `SELECT * FROM task_tags`},
		// No cascade and no blockingReference, and the difference from
		// `tags` below is the point: a deleted tag there takes its
		// *assignment rows* with it, while a task's tag is a column on the
		// task. `ON DELETE SET NULL` in the schema unassigns it instead —
		// the tasks stay and fall back to the group named after where they
		// came from. Deleting the tag is therefore allowed outright, unlike
		// FR-24.3's retire-instead-of-delete for a row something *is*.
	},

	TableTags: {
		partition: partitionMaster,
		guard:     unguarded, // shared master data (FR-24.1): any account creates one by typing it in M10
		label:     activityLabel{name: own("name")},
		columns:   toSet("name", "sort_order", MarkColumn), // the mark: FR-24.13
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
		guard:     unguarded, // an assignment of shared master data (FR-24.1); a dangling id fails the FK
		label:     activityLabel{name: via("tag_id", TableTags, "name"), subject: via("item_id", TableItems, "name")},
		columns:   toSet("item_id", "tag_id", "position"),
		visible:   visibilityRule{everyone: true},
		// The assignments travel with the items in the backup too — an item
		// restored without them is untagged and vanishes from every M9
		// grouping.
		export: exportQuery{query: `SELECT * FROM item_tags`},
	},

	// There is no category_id column (FR-24.1): a client still sending one
	// is rejected rather than silently ignored.
	TableItems: {
		serverOwned: stampedOnCreate(columnCreatedBy),
		partition:   partitionMaster,
		guard:       unguarded, // shared instance-wide (FR-24.1)
		label:       activityLabel{name: own("name")},
		columns: toSet(
			"name", "weight_grams", "value_cents",
			"created_by",
			"image_hash",
			MarkColumn,
			RetiredColumn,
			DefaultAssigneeColumn,
			MergedIntoColumn,
		),
		retirable: true,
		blockedBy: []blockingReference{
			{TableTemplateItems, "item_id"},
			{TableTripItems, "source_item_id"},
			// FR-31.4: an excursion's line names the item it was made from,
			// as a trip row does, and is history the same way.
			{TableExcursionItems, "source_item_id"},
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
		guard:     unguarded, // shared like the items they relate (FR-20.1); a dangling endpoint fails the FK
		label:     activityLabel{name: via("depends_on_item_id", TableItems, "name"), subject: via("item_id", TableItems, "name")},
		columns:   toSet("item_id", "depends_on_item_id", "mode", "quantity"),
		visible:   visibilityRule{everyone: true},
		export:    exportQuery{query: `SELECT * FROM item_dependencies`},
	},

	// is_published stays in the schema but off this list: the publish gate
	// is parked with the FR-1.6 MVP simplification (templates are shared
	// instance-wide), and an unreadable column no client can set is the
	// honest state until the stub's revisit trigger fires.
	TableTemplates: {
		serverOwned: stampedOnCreate(columnOwnerID),
		partition:   partitionMaster,
		guard:       validKindSwitch,
		label:       activityLabel{name: own("name")},
		columns:     toSet("owner_id", "name", "kind", MarkColumn, RetiredColumn),
		retirable:   true,
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
			{TableTemplateTasks, `SELECT id FROM template_tasks WHERE template_id = ?`},
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
		guard:     unguarded, // follows its template's governance (FR-1.6 MVP: shared); a dangling parent fails the FK
		label:     activityLabel{name: via("item_id", TableItems, "name"), subject: via("template_id", TableTemplates, "name")},
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
		guard:     validInclude,
		label:     activityLabel{name: via("included_template_id", TableTemplates, "name"), subject: via("template_id", TableTemplates, "name")},
		columns:   toSet("template_id", "included_template_id"),
		visible:   visibilityRule{everyone: true},
		export:    exportQuery{query: `SELECT * FROM template_includes`},
	},

	TableTemplateItemTasks: {
		partition: partitionMaster,
		guard:     unguarded, // follows its template's governance (FR-27.7, FR-1.6 MVP: shared)
		label:     activityLabel{name: own("task")},
		columns:   toSet("template_item_id", "task"),
		visible:   visibilityRule{everyone: true},
		export:    exportQuery{query: `SELECT * FROM template_item_tasks`},
	},

	TableTemplateTasks: {
		partition: partitionMaster,
		guard:     unguarded, // follows its template's governance (FR-7.4, FR-1.6 MVP: shared)
		label:     activityLabel{name: own("task"), subject: via("template_id", TableTemplates, "name")},
		// FR-7.7: `phase` is the phase the instantiated task starts in.
		columns: toSet("template_id", "task", "phase"),
		visible: visibilityRule{everyone: true},
		export:  exportQuery{query: `SELECT * FROM template_tasks`},
	},

	TableTripSeries: {
		serverOwned: stampedOnCreate(columnOwnerID),
		partition:   partitionMaster,
		guard:       seriesOwner,
		label:       activityLabel{name: own("name")},
		columns:     toSet("owner_id", "name", "default_attributes"),
		visible:     visibilityRule{ownerQuery: `SELECT owner_id FROM trip_series WHERE id = ?`},
		export:      exportQuery{query: `SELECT * FROM trip_series WHERE owner_id = ?`, scoped: true},
		blockedBy: []blockingReference{
			{TableTrips, "series_id"},
		},
		cascades: []childQuery{
			{TableDestinationChecklistItems, `SELECT ci.id FROM destination_checklist_items ci
			 JOIN destination_profiles p ON p.id = ci.profile_id WHERE p.series_id = ?`},
			{TableDestinationTasks, `SELECT dt.id FROM destination_tasks dt
			 JOIN destination_profiles p ON p.id = dt.profile_id WHERE p.series_id = ?`},
			{TableDestinationProfiles, `SELECT id FROM destination_profiles WHERE series_id = ?`},
		},
	},

	TableDestinationProfiles: {
		partition: partitionMaster,
		guard:     profileSeriesOwner,
		label:     activityLabel{name: via("series_id", TableTripSeries, "name")},
		columns:   toSet("series_id", "notes"),
		// Ownership follows the series chain (FR-13.2), for reading as for
		// writing.
		visible: visibilityRule{ownerQuery: `SELECT s.owner_id FROM destination_profiles p
			 JOIN trip_series s ON s.id = p.series_id WHERE p.id = ?`},
		export: exportQuery{query: `SELECT p.* FROM destination_profiles p
			JOIN trip_series s ON s.id = p.series_id WHERE s.owner_id = ?`, scoped: true},
		cascades: []childQuery{
			{TableDestinationChecklistItems, `SELECT id FROM destination_checklist_items WHERE profile_id = ?`},
			{TableDestinationTasks, `SELECT id FROM destination_tasks WHERE profile_id = ?`},
		},
	},

	TableDestinationChecklistItems: {
		partition: partitionMaster,
		guard:     checklistSeriesOwner,
		label:     activityLabel{name: own("label")},
		columns:   toSet("profile_id", "label", "mode"),
		visible: visibilityRule{ownerQuery: `SELECT s.owner_id FROM destination_checklist_items ci
			 JOIN destination_profiles p ON p.id = ci.profile_id
			 JOIN trip_series s ON s.id = p.series_id WHERE ci.id = ?`},
		export: exportQuery{query: `SELECT ci.* FROM destination_checklist_items ci
			JOIN destination_profiles p ON p.id = ci.profile_id
			JOIN trip_series s ON s.id = p.series_id WHERE s.owner_id = ?`, scoped: true},
	},

	// FR-13.4: a task the destination profile carries, materialised as an
	// ordinary trip task on every trip of the series (ADR-106). The guard
	// is the checklist item's own, unchanged: both tables hang off
	// destination_profiles by the same profile_id column.
	TableDestinationTasks: {
		partition: partitionMaster,
		guard:     checklistSeriesOwner,
		label:     activityLabel{name: own("task")},
		columns:   toSet("profile_id", "task", "lead_days", "assignee_user_id"),
		visible: visibilityRule{ownerQuery: `SELECT s.owner_id FROM destination_tasks dt
			 JOIN destination_profiles p ON p.id = dt.profile_id
			 JOIN trip_series s ON s.id = p.series_id WHERE dt.id = ?`},
		export: exportQuery{query: `SELECT dt.* FROM destination_tasks dt
			JOIN destination_profiles p ON p.id = dt.profile_id
			JOIN trip_series s ON s.id = p.series_id WHERE s.owner_id = ?`, scoped: true},
	},

	TableTrips: {
		serverOwned: stampedOnCreate(columnCreatedBy),
		partition:   partitionMaster,
		guard:       tripMembership,
		label:       activityLabel{name: own("name")},
		columns: toSet(
			"series_id", "name", "year", "start_date", "end_date", "status",
			"attributes", "packing_closed_at", "imported", "created_by",
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
		guard:     memberAdministration,
		label:     activityLabel{name: via("user_id", tableUsers, "display_name")},
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
		guard:     tripEditor,
		label:     activityLabel{name: via("template_id", TableTemplates, "name")},
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
		guard:     tripEditor,
		label:     activityLabel{name: own("item_name"), subject: own("source_template_name")},
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
		serverOwned: tripItemOwned,
		partition:   partitionTrip,
		guard:       unguarded, // membership in the trip is the whole gate; the records are stamped (stamp.go)
		label:       activityLabel{name: own("name")},
		columns: toSet(
			"trip_id", "source_item_id", "source_template_id", "name",
			"weight_grams", "value_cents", "category_name", "quantity",
			"packed_count", "state", "mode", "late_packer", "pack_note", // FR-25.33
			// FR-25.11j: the list the row was bought from. A client-chosen
			// value like packer_user_id beside it — it records a decision the
			// person made, not an identity claim, so it is not server-owned.
			"bought_from",
			// FR-30.4: the purchase's record, server-owned the way
			// packed_by_user_id is — listed so the stamp can be persisted.
			"bought_at", "bought_by_user_id",
			"assigned_traveler_id", "packer_user_id", "container_id",
			"packing_now_by", "packing_now_at", "flag_unused", "flag_missing", "needed_quantity",
			"outbound_packed",
			// Listed so the server's own stamp can be persisted through the
			// push path; the stamp step discards any client-sent value first
			// (FR-25.19, invariant 3). packed_at is the same record's time
			// (FR-25.17) and goes through the same gate.
			"packed_by_user_id", "packed_at",
			// FR-7.16: when the close of the packing carried the row to the
			// destination — the client's clock, like packed_at's record.
			"carried_over_at",
			// FR-30.13: the line's place on the shopping list (ADR-083).
			"shopping_position",
		),
		// The one cascade of the *trip* partition: a row's comments and
		// FR-7.3 tasks hang off it (comments.trip_item_id ON DELETE
		// CASCADE). Trip-level comments have a NULL trip_item_id and are
		// untouched by the delete, so the query names the row explicitly
		// rather than matching on the trip. note_acks is reachable a second
		// hop down (comments.id ON DELETE CASCADE) and is named here too —
		// the fkgraph test walks transitively but a tableSpec's own
		// `cascades` does not, so each reachable table needs its own entry.
		cascades: []childQuery{
			{TableComments, `SELECT id FROM comments WHERE trip_item_id = ?`},
			{TableNoteAcks, `SELECT id FROM note_acks WHERE comment_id IN
				(SELECT id FROM comments WHERE trip_item_id = ?)`},
		},
		export: exportQuery{query: `SELECT x.* FROM trip_items x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// There is no profile column (FR-25.9): a client still sending one is
	// rejected rather than silently ignored.
	TableTravelers: {
		partition: partitionTrip,
		guard:     validTravelerLink,
		label:     activityLabel{name: own("name")},
		columns:   toSet("trip_id", "name", "linked_user_id"),
		export: exportQuery{query: `SELECT x.* FROM travelers x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
		blockedBy: []blockingReference{
			{TableTripItems, "assigned_traveler_id"},
			{TableContainers, "carrier_traveler_id"},
		},
		// FR-31.3/31.5: a traveller taken off the trip is off its excursions
		// too, with their own lines there. Unlike a trip row, whose delete
		// is refused above, an excursion line is only ever that person's
		// share of a small list, and nobody is left to pack it.
		cascades: []childQuery{
			{TableExcursionTravelers, `SELECT id FROM excursion_travelers WHERE traveler_id = ?`},
			{TableExcursionItems, `SELECT id FROM excursion_items WHERE assigned_traveler_id = ?`},
			// FR-29.15: the same for a day-plan entry; one left naming nobody
			// is for everybody again.
			{TableDayEntryTravelers, `SELECT id FROM day_entry_travelers WHERE traveler_id = ?`},
		},
	},

	TableContainers: {
		partition: partitionTrip,
		guard:     unguarded, // membership in the trip is the whole gate
		label:     activityLabel{name: own("name")},
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
		serverOwned: commentOwned,
		partition:   partitionTrip,
		guard:       allOf(validNoteThread, validIdeaResult),
		label: activityLabel{
			name: own("title", "body"),
			// A task on a packing row names the row; a reply names its thread.
			subject: append(via("trip_item_id", TableTripItems, "name"),
				append(via("parent_id", TableComments, "title"), via("parent_id", TableComments, "body")...)...),
		},
		columns: toSet(
			"trip_id", "trip_item_id", "author_id", "body",
			"is_task", "task_state",
			// FR-7.5/FR-7.7: a task's assignment, the client's to choose
			// like trip_items.packer_user_id — since FR-7.7 on both kinds
			// of task, not only the trip's own.
			"assignee_user_id",
			// FR-7.7: when the task is meant to be done (the client's
			// choice), and the resolution's record. `resolved_by_user_id`
			// is listed so the server's own stamp can be persisted through
			// the push path — the stamp step discards any client-sent value
			// first (invariant 3), exactly as it does for packed_by_user_id.
			"phase", "resolved_at", "resolved_by_user_id",
			// FR-7.8: the one tag the task carries, the user's own statement
			// about what it is about — nothing to stamp (invariant 3 is about
			// identity, and a tag is not one).
			"task_tag_id",
			// FR-7.11/7.18: the day it is due and the time its reminder comes
			// on it — the client's, like the phase; the scheduler only reads them.
			"due_date", "due_time",
			// FR-7.7: the moment the task was written. The client names it
			// (Local Mode has no server to default it), and the column's own
			// DEFAULT still covers a mutation that omits it — the same shape
			// as trip_items.packed_at.
			"created_at",
			// FR-7.13: a reply's thread (written once — the trip scope rule
			// drops it from every later op), a first note's title, and when
			// an entry was edited, which the client names like resolved_at.
			"parent_id", "title", "edited_at",
			// FR-7.15: the excursion a thread is about, the author's to
			// choose; validNoteThread keeps it on a first note of the trip.
			"excursion_id",
			// FR-7.17: the task's place inside its group (ADR-083).
			"position",
			// FR-29.13: the idea a trip task was made from (validIdeaResult
			// checks it); FR-29.21: a preparation step's lead before its day.
			columnIdeaID, "lead_days",
			// FR-13.4: a series task's lead before the trip's start, and the
			// series task it was materialised from (ADR-106).
			"start_lead_days", "destination_task_id",
		),
		// FR-7.9: a note's per-person ticks hang off it (note_acks.comment_id
		// ON DELETE CASCADE). A task's own resolution needs nothing here — it
		// is a column on the same row, unlike a note's tick. FR-7.13: so do a
		// first note's replies (comments.parent_id ON DELETE CASCADE), and
		// their ticks a hop further down, should one ever carry any.
		cascades: []childQuery{
			{TableComments, `SELECT id FROM comments WHERE parent_id = ?`},
			{TableNoteAcks, `SELECT id FROM note_acks WHERE comment_id = ?1
				OR comment_id IN (SELECT id FROM comments WHERE parent_id = ?1)`},
		},
		export: exportQuery{query: `SELECT x.* FROM comments x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-7.9: one row per (note, person) who has ticked it — see schema.sql
	// for why this is a table and not a column on comments.
	TableNoteAcks: {
		serverOwned: stampedOnInsert(columnUserID),
		partition:   partitionTrip,
		guard:       unguarded, // membership in the trip is the whole gate; whose tick it is, is stamped
		label:       activityLabel{name: append(via("comment_id", TableComments, "title"), via("comment_id", TableComments, "body")...)},
		columns:     toSet("trip_id", "comment_id", "user_id", "acked", "seen_through"),
		export: exportQuery{query: `SELECT x.* FROM note_acks x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-30.1: the shopping list's own entries. Nothing references them
	// and they reference nothing but their trip, so they block no delete
	// and cascade nothing (ADR-066).
	TableShoppingEntries: {
		serverOwned: boughtFlagOwned,
		partition:   partitionTrip,
		guard:       validIdeaResult,
		label:       activityLabel{name: own("name")},
		columns: toSet(
			"trip_id", "name", "list", "bought",
			// FR-30.9: the entry's one tag, client-chosen free text.
			"tag",
			// FR-30.4, server-owned (stamp.go).
			"bought_at", "bought_by_user_id",
			// FR-30.10: the day it is due — the client's to choose, like a
			// task's (FR-7.11); the reminder scheduler only reads it.
			"due_date",
			// FR-30.12: who is to buy it — the client's to choose, like a
			// task's assignee (FR-7.5).
			"assignee_user_id",
			// FR-7.16: when the close of the packing carried the entry to
			// the destination — the client's to name, like the due day.
			"carried_over_at",
			// FR-30.13: the entry's place inside its heading (ADR-083).
			"position",
			// FR-29.13: the idea it was made from; validIdeaResult checks it.
			columnIdeaID,
		),
		export: exportQuery{query: `SELECT x.* FROM shopping_entries x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-31.1: an excursion. Its participants and lines hang off it and go
	// with it (ON DELETE CASCADE), leaf-first.
	TableExcursions: {
		partition: partitionTrip,
		guard:     validIdeaResult,
		label:     activityLabel{name: own("name")},
		// FR-29.13: idea_id is the idea it was made from; validIdeaResult checks it.
		columns: toSet("trip_id", "name", "starts_on", "ends_on", "source_template_id", columnIdeaID),
		cascades: []childQuery{
			{TableExcursionTravelers, `SELECT id FROM excursion_travelers WHERE excursion_id = ?`},
			{TableExcursionItems, `SELECT id FROM excursion_items WHERE excursion_id = ?`},
			{TableExcursionTracks, `SELECT id FROM excursion_tracks WHERE excursion_id = ?`},
		},
		export: exportQuery{query: `SELECT x.* FROM excursions x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-31.3: one participant of one excursion — see schema.sql for why a
	// row per person.
	TableExcursionTravelers: {
		partition: partitionTrip,
		guard:     unguarded, // membership in the trip is the whole gate
		label:     activityLabel{name: via("traveler_id", TableTravelers, "name"), subject: via("excursion_id", TableExcursions, "name")},
		columns:   toSet("trip_id", "excursion_id", "traveler_id"),
		export: exportQuery{query: `SELECT x.* FROM excursion_travelers x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-31.4: one line of an excursion's list. trip_item_id is ON DELETE
	// SET NULL, so a suitcase row's delete cascades nothing here.
	TableExcursionItems: {
		partition: partitionTrip,
		guard:     unguarded, // membership in the trip is the whole gate
		label:     activityLabel{name: own("name"), subject: via("excursion_id", TableExcursions, "name")},
		columns: toSet(
			"trip_id", "excursion_id", "trip_item_id", "source_item_id",
			"name", "category_name", "assigned_traveler_id",
			"quantity", "packed_count", "state", "mode", "bought_at",
			"not_in_luggage", "for_all_participants",
			// FR-30.13: the line's place on M6's Vor-Ort list (ADR-083).
			"shopping_position",
		),
		export: exportQuery{query: `SELECT x.* FROM excursion_items x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-31.15: a GPX track on an excursion, as an idea's (TableIdeaTracks).
	TableExcursionTracks: {
		partition: partitionTrip,
		guard:     validTrack,
		label:     activityLabel{name: own(columnName), subject: via("excursion_id", TableExcursions, "name")},
		columns: toSet(
			"trip_id", "excursion_id", columnName, "file_name", columnKind, columnWithKid, columnPauseMin,
			columnPosition, "gpx_hash", "distance_m", "ascent_m", "descent_m", "max_ele_m",
			"point_count", columnLine,
		),
		unlogged: toSet(columnLine),
		export: exportQuery{query: `SELECT x.* FROM excursion_tracks x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-29.1: an idea. Its votes and its discussion hang off it and go with
	// it (ON DELETE CASCADE), leaf-first. `author_id` is listed so the
	// server's own stamp can be persisted; the stamp step discards a client value.
	TableIdeas: {
		serverOwned: stampedOnInsert(columnAuthorID),
		partition:   partitionTrip,
		guard:       unguarded, // membership in the trip is the whole gate; the author is stamped
		label:       activityLabel{name: own("title")},
		columns: toSet(
			"trip_id", "author_id", "title", "note", "link", "tag",
			"rain_proof", "state", "created_at",
			// FR-29.14: the day it is planned on, and when on it.
			"planned_on", "planned_at",
		),
		cascades: []childQuery{
			{TableIdeaVotes, `SELECT id FROM idea_votes WHERE idea_id = ?`},
			{TableIdeaComments, `SELECT id FROM idea_comments WHERE idea_id = ?`},
			{TableIdeaImages, `SELECT id FROM idea_images WHERE idea_id = ?`},
			{TableIdeaTracks, `SELECT id FROM idea_tracks WHERE idea_id = ?`},
		},
		export: exportQuery{query: `SELECT x.* FROM ideas x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-29.3: one person's vote on one idea — see schema.sql for why a row
	// per person. `user_id` is stamped, and only its voter may change it.
	TableIdeaVotes: {
		serverOwned: stampedOnInsert(columnUserID),
		partition:   partitionTrip,
		guard:       validIdeaVote,
		label:       activityLabel{name: via("idea_id", TableIdeas, "title")},
		columns:     toSet("trip_id", "idea_id", "user_id", "vote"),
		export: exportQuery{query: `SELECT x.* FROM idea_votes x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-29.4: one entry of an idea's discussion; its words are its author's.
	TableIdeaComments: {
		serverOwned: stampedOnInsert(columnAuthorID),
		partition:   partitionTrip,
		guard:       validIdeaComment,
		label:       activityLabel{name: own("body"), subject: via("idea_id", TableIdeas, "title")},
		columns:     toSet("trip_id", "idea_id", "author_id", "body", "created_at", "edited_at"),
		export: exportQuery{query: `SELECT x.* FROM idea_comments x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-29.5: a picture on an idea. The upload creates the row (with its
	// bytes, which never sync); every column is listed so the pull carries
	// it, and validIdeaImage lets a push only move a picture or delete it.
	TableIdeaImages: {
		partition: partitionTrip,
		guard:     validIdeaImage,
		label:     activityLabel{name: via("idea_id", TableIdeas, "title")},
		columns:   toSet("trip_id", "idea_id", "image_hash", columnPosition),
		export: exportQuery{query: `SELECT x.* FROM idea_images x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-29.15: an entry of the day plan's own. `author_id` is listed so the
	// server's stamp can be persisted; the stamp step discards a client value. A
	// connection's legs (FR-29.18) are left out of the log like a track's line.
	TableDayEntries: {
		serverOwned: stampedOnInsert(columnAuthorID),
		partition:   partitionTrip,
		guard:       noteExcursion,
		label:       activityLabel{name: own("title")},
		columns: toSet(
			"trip_id", "author_id", columnKind, "on_date", "at_time", "title", "note", columnLink, columnLegs,
			// FR-29.18: the excursion a connection belongs to; noteExcursion checks it.
			columnExcursionID,
			// FR-29.18: the way there or back on that excursion.
			"excursion_role",
		),
		unlogged: toSet(columnLegs),
		cascades: []childQuery{
			{TableDayEntryTravelers, `SELECT id FROM day_entry_travelers WHERE day_entry_id = ?`},
		},
		export: exportQuery{query: `SELECT x.* FROM day_entries x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-29.15: one traveller a day-plan entry is for — see schema.sql for
	// why a row per person. validDayEntryTraveler keeps both on the trip.
	TableDayEntryTravelers: {
		partition: partitionTrip,
		guard:     validDayEntryTraveler,
		label:     activityLabel{name: via("traveler_id", TableTravelers, "name"), subject: via("day_entry_id", TableDayEntries, "title")},
		columns:   toSet("trip_id", "day_entry_id", "traveler_id"),
		export: exportQuery{query: `SELECT x.* FROM day_entry_travelers x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-33.1: a meal of the meal plan. Its ingredients hang off it and go
	// with it (ON DELETE CASCADE), so a deleted meal leaves no line on any
	// device's shopping list (FR-33.9).
	TableMeals: {
		partition: partitionTrip,
		guard:     noteExcursion,
		label:     activityLabel{name: own("title")},
		columns: toSet(
			"trip_id", "on_date", "slot", "title", columnKind, "at_time", "note", "place",
			// FR-33.8: who cooks — the client's to choose, like an assignee.
			"cook_user_id",
			// FR-33.6: the excursion a picnic is taken on; noteExcursion checks it.
			columnExcursionID, "excursion_packed_at",
		),
		cascades: []childQuery{
			{TableMealIngredients, `SELECT id FROM meal_ingredients WHERE meal_id = ?`},
		},
		export: exportQuery{query: `SELECT x.* FROM meals x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-33.2: an ingredient of a meal; validIngredientMeal keeps it on a
	// meal of its own trip.
	TableMealIngredients: {
		serverOwned: boughtFlagOwned,
		partition:   partitionTrip,
		guard:       validIngredientMeal,
		label:       activityLabel{name: own("name"), subject: via("meal_id", TableMeals, "title")},
		columns: toSet(
			"trip_id", "meal_id", "name", "amount", "list", columnPosition, "bought",
			// FR-30.4, server-owned (stamp.go).
			"bought_at", "bought_by_user_id",
			// FR-30.13: the line's place on M6 (ADR-083).
			"shopping_position",
			// FR-33.13: fresh or durable, set by hand.
			"fresh",
		),
		export: exportQuery{query: `SELECT x.* FROM meal_ingredients x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// FR-29.17: a GPX track on an idea. The upload creates the row (with its
	// file, which never syncs); every column is listed so the pull carries
	// it, and validTrack lets a push change only what a person sets.
	TableIdeaTracks: {
		partition: partitionTrip,
		guard:     validTrack,
		label:     activityLabel{name: own(columnName), subject: via("idea_id", TableIdeas, "title")},
		columns: toSet(
			"trip_id", "idea_id", columnName, "file_name", columnKind, columnWithKid, columnPauseMin,
			columnPosition, "gpx_hash", "distance_m", "ascent_m", "descent_m", "max_ele_m",
			"point_count", columnLine,
		),
		unlogged: toSet(columnLine),
		export: exportQuery{query: `SELECT x.* FROM idea_tracks x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},

	// trip_generated_positions is trip-partition state: it is only ever read
	// beside the rows it describes, and it should travel with them.
	//
	// FR-27.4: what generation last produced per position — the record that
	// lets the refresh tell a manual edit from its own previous work.
	TableTripGeneratedPositions: {
		partition: partitionTrip,
		guard:     unguarded, // membership in the trip is the whole gate
		label:     activityLabel{name: own("name")},
		columns: toSet(
			"trip_id", "trip_item_id", "source_template_id", "source_item_id",
			"traveler_id", "name", "quantity", "mode", "late_packer",
			"weight_grams", "value_cents", "category_name", "tasks",
		),
		export: exportQuery{query: `SELECT x.* FROM trip_generated_positions x
			JOIN trip_members m ON m.trip_id = x.trip_id WHERE m.user_id = ?`, scoped: true},
	},
}
