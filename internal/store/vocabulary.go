// vocabulary.go names the vocabulary every mutation, guard and export in
// this package compares against: table names, column names a guard or the
// sync whitelist switches on, the closed set of push-refusal reasons, the
// trip roles and the two template kinds. A literal repeated across files is
// named once here rather than copied — CODING_PRINCIPLES §4a.

package store

// columnTripID is the column that ties a row to its trip. It is compared
// against rather than merely written, in the trip partition's confinement
// and in the master partition's parent checks, so it is named once.
const columnTripID = "trip_id"

// The syncable tables, named once. Every partition set, authorization
// switch, visibility rule, cascade and export list below compares against
// these rather than against a literal — a table name is switched on in five
// places across two packages, and a typo in any one of them fails as a
// silently missing case rather than as a compile error.
const (
	TableTags                      = "tags"
	TableTaskTags                  = "task_tags"
	TableItemTags                  = "item_tags"
	TableItems                     = "items"
	TableItemDependencies          = "item_dependencies"
	TableTemplates                 = "templates"
	TableTemplateItems             = "template_items"
	TableTemplateIncludes          = "template_includes"
	TableTemplateItemTasks         = "template_item_tasks"
	TableTemplateTasks             = "template_tasks"
	TableTrips                     = "trips"
	TableTripMembers               = "trip_members"
	TableTripSeries                = "trip_series"
	TableDestinationProfiles       = "destination_profiles"
	TableDestinationChecklistItems = "destination_checklist_items"
	TableDestinationTasks          = "destination_tasks"
	TableTripItems                 = "trip_items"
	TableTravelers                 = "travelers"
	TableContainers                = "containers"
	TableComments                  = "comments"
	// FR-7.9: a per-person tick on a trip note (ADR-073).
	TableNoteAcks = "note_acks"
	// FR-30.1: the shopping list's own entries (ADR-066).
	TableShoppingEntries = "shopping_entries"
	// FR-31: an excursion, who goes on it, and its own packing lines (ADR-077).
	TableExcursions         = "excursions"
	TableExcursionTravelers = "excursion_travelers"
	TableExcursionItems     = "excursion_items"
	// §3.29: the planner's ideas, one vote per person on each, and each
	// idea's discussion (FR-29.1–29.4, ADR-078).
	TableIdeas        = "ideas"
	TableIdeaVotes    = "idea_votes"
	TableIdeaComments = "idea_comments"
	// FR-29.5: a picture on an idea — its hash and position; the bytes stay
	// outside the envelope (ADR-002).
	TableIdeaImages = "idea_images"
	// FR-29.15: the day plan's own entries.
	TableDayEntries = "day_entries"
	// FR-29.15: whom a day-plan entry is for — a row per traveller, none
	// meaning everybody.
	TableDayEntryTravelers = "day_entry_travelers"
	// FR-29.17: a GPX track on an idea — what the device read from the file;
	// the file stays outside the envelope (ADR-085).
	TableIdeaTracks = "idea_tracks"
	// FR-31.15: a GPX track on an excursion, kept as an idea's is (ADR-089).
	TableExcursionTracks = "excursion_tracks"
	// §3.33: a trip's meals and their ingredients — the shopping list's
	// lines by projection (ADR-092).
	TableMeals           = "meals"
	TableMealIngredients = "meal_ingredients"
	// FR-27.4, the planning-trip refresh (migration 023).
	TableTripTemplateSources    = "trip_template_sources"
	TableTripGeneratedPositions = "trip_generated_positions"
	TableTripAppliedChanges     = "trip_applied_changes"
)

// DefaultAssigneeColumn is the optional account an inventory item is
// normally assigned to (FR-1.9). Named once: the sync whitelist and the
// tests compare against it.
const DefaultAssigneeColumn = "default_assignee_id"

// MergedIntoColumn is FR-24.15's alias: the item a merged-away row was
// merged into. Named once, like the columns above — the sync whitelist, the
// client's reader and the tests all compare against it.
const MergedIntoColumn = "merged_into_id"

// The item mark (§3.28), named once because three layers compare against
// it: the schema's CHECK, the handler's cap, and the sync whitelist.
const (
	// MarkColumn is the column carrying one optional emoji on items and
	// templates alike (FR-28.1/28.8).
	MarkColumn = "icon"
	// MarkMaxBytes is the whole of the server's validation (FR-28.9). It
	// holds any single emoji including a ZWJ sequence with modifiers; the
	// curated index the client picks from lives client-side, because the
	// mark is a display preference and not a security boundary.
	MarkMaxBytes = 32
)

// RetiredColumn carries FR-24.3's lifecycle marker on items and templates
// alike: NULL while the row is active, an RFC3339 stamp once a delete was
// answered by retiring the row instead of removing it. It is an ordinary
// synced column — the marker has to reach every device, or a row is hidden
// on the one that deleted it and present everywhere else.
const RetiredColumn = "retired_at"

// TripStatusArchived is the lifecycle state of a finished trip (FR-9.2). A
// task on an archived trip is history, and nobody is reminded of it.
const TripStatusArchived = "archived"

// The two template scopes (FR-27.1), named once: they are compared
// against in the include rule, in the scope-switch guards and in the
// schema's own CHECK, and a mistyped literal reads as "some other scope"
// rather than as a build failure (CODING_PRINCIPLES §4a).
const (
	// KindTemplate is a Ferien-Vorlage: it may include groups and is what
	// a trip is generated from.
	KindTemplate = "template"
	// KindGroup is a Gruppe: it carries item positions only and is the
	// thing a Ferien-Vorlage includes.
	KindGroup = "group"
)

// RejectReason names why a mutation was refused, so a `rejected` outcome
// can be turned into a sentence instead of a shrug (Sync-API §5). The set is
// closed and travels as the push result's `error`: the client maps it to
// copy, and could branch on it. It is a vocabulary rather than a message
// because the message belongs to whoever renders it — in the user's own
// language, which the server does not know.
type RejectReason string

// The reasons a push can be refused for. Every place in this package that
// produces sync.OutcomeRejected names one of them.
const (
	// ReasonNone is the zero value: an outcome that is not a refusal.
	ReasonNone RejectReason = ""
	// ReasonNotAuthorized is a rule about the person (FR-4.5/4.7): they may
	// not touch this row, however valid the change itself is.
	ReasonNotAuthorized RejectReason = "not_authorized"
	// ReasonOutOfScope is a mutation aimed outside the partition it was
	// pushed to (Sync-API P-3) — a client bug rather than a user's mistake.
	ReasonOutOfScope RejectReason = "out_of_scope"
	// ReasonStillReferenced is a delete the rest of the database depends on:
	// deleting a Vorlage a trip item names would strip FR-9.2 provenance from
	// an archived trip, so the row stays and the delete is refused.
	ReasonStillReferenced RejectReason = "still_referenced"
	// ReasonTemplateScope is the FR-27.1 two-level rule and the FR-27.6 scope
	// switches that protect it — structural, not a matter of permission.
	ReasonTemplateScope RejectReason = "template_scope"
	// ReasonMalformedHLC is a clock outside the protocol's format (§3).
	// Lexicographic order is the merge rule, so an unorderable string is not
	// a parse failure but a permanent one: stored once, it outranks every
	// clock a device can generate and the field can never be written again.
	ReasonMalformedHLC RejectReason = "malformed_hlc"
	// ReasonConstraintViolated is everything the schema itself refused: a
	// foreign key whose parent is gone, a UNIQUE two devices raced into, a
	// CHECK the mutation's values fail.
	ReasonConstraintViolated RejectReason = "constraint_violated"
	// ReasonRowDeleted is a write that lost to a delete it never saw: the
	// row is gone and the tombstone is newer, so creating it again would
	// undo somebody else's delete rather than merge with it (Sync-API §6).
	ReasonRowDeleted RejectReason = "row_deleted"
	// ReasonNotATripMember is a traveler's linked_user_id naming an account
	// that is not (or no longer) a trip_members row of the same trip
	// (FR-2.5, ADR-058): the notification pipeline trusts trip_members as
	// its whole recipient universe, so a link outside it would be a deep
	// link the recipient's device cannot open.
	ReasonNotATripMember RejectReason = "not_a_trip_member"
)

// The trip roles (FR-4.5/4.7), named once: they are compared against in
// every authorization decision, and a mistyped literal reads as "not that
// role" rather than as a build failure.
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleEditor = "editor"
)
