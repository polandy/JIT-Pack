// Package store — master.go implements the master-partition side of the
// sync protocol (Sync-API Spec §4/§5, P-3): per-user pull visibility and
// ownership-enforcing push for tags, items, templates,
// template_items, and trips metadata.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"jitpack/internal/sync"
)

// ApplyMasterMutation resolves one master-partition mutation for userID.
// Beyond the trip-partition pipeline it enforces authorization (FR-4.5):
// trips are writable only by members (delete: owner/admin) and series only
// by their owner, while templates and master items are shared instance-wide
// (FR-1.6 MVP). Server-owned columns (owner_id, created_by) are stamped on
// insert and never rewritten afterwards. Unauthorized
// mutations return outcome "rejected" instead of an error so the push
// batch continues (spec §5).
func (s *Store) ApplyMasterMutation(ctx context.Context, userID string, m sync.Mutation) (MutationResult, error) {
	if err := validate(m, masterPartitionTables); err != nil {
		return MutationResult{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MutationResult{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	if recorded, found, err := recordedResult(ctx, tx, m.MutationID); err != nil {
		return MutationResult{}, err
	} else if found {
		return recorded, nil
	}

	row, err := loadRow(ctx, tx, m.Table, m.ID)
	if err != nil {
		return MutationResult{}, err
	}

	res := MutationResult{MutationID: m.MutationID}
	refused, err := authorizeMaster(ctx, tx, userID, &m, row.Fields, row.Exists)
	if err != nil {
		return MutationResult{}, err
	}
	if refused != ReasonNone {
		res.Outcome = sync.OutcomeRejected
		res.Reason = refused
		if res.Seq, err = relogRefused(ctx, tx, nil, m, row); err != nil {
			return MutationResult{}, err
		}
		return res, finalize(ctx, tx, res)
	}

	merged := sync.Merge(row, m)
	res.Outcome = merged.Outcome
	res.Conflicts = merged.Conflicts

	// Asked before the delete rather than read out of the failure it would
	// cause: the driver's constraint error is a message, and a message is
	// not a contract to branch on. FR-9.2 is why the reference blocks at all
	// — an archived trip keeps knowing which Vorlage its rows came from.
	var retiring bool
	if blocked, err := stillReferenced(ctx, tx, m, merged.Deleted, row.Exists); err != nil {
		return MutationResult{}, err
	} else if blocked && lifecycleTables[m.Table] {
		// FR-24.3: for a master item or a Vorlage the reference does not
		// refuse the delete, it decides which delete this is. The row is
		// kept so history keeps resolving against it and marked so no
		// display surface offers it again.
		retiring = true
		m = retireInstead(m, time.Now().UTC().Format(time.RFC3339))
		merged = sync.Merge(row, m)
		res.Outcome = merged.Outcome
		res.Conflicts = merged.Conflicts
	} else if blocked {
		res.Outcome = sync.OutcomeRejected
		res.Reason = ReasonStillReferenced
		res.Conflicts = nil
		if res.Seq, err = relogRefused(ctx, tx, nil, m, row); err != nil {
			return MutationResult{}, err
		}
		return res, finalize(ctx, tx, res)
	}

	// FK cascades delete child rows silently; collect their ids up front
	// so the whole cascade can be tombstoned for clients.
	cascaded, err := cascadeChildren(ctx, tx, m, merged.Deleted, row.Exists)
	if err != nil {
		return MutationResult{}, err
	}

	changed, err := persist(ctx, tx, m.Table, m, merged, row.Exists)
	if err != nil {
		if isConstraintViolation(err) {
			// What is left after the pre-check above: two admins racing to
			// add the same member (UNIQUE), a mutation naming a parent that
			// is gone (FK), values a CHECK refuses. The statement failed and
			// the transaction survives — reject cleanly.
			res.Outcome = sync.OutcomeRejected
			res.Reason = ReasonConstraintViolated
			res.Conflicts = nil
			if res.Seq, err = relogRefused(ctx, tx, nil, m, row); err != nil {
				return MutationResult{}, err
			}
			return res, finalize(ctx, tx, res)
		}
		return MutationResult{}, err
	}
	if changed {
		res.Seq, err = appendChangeLog(ctx, tx, nil, m, merged.Deleted)
		if err != nil {
			return MutationResult{}, err
		}
		for _, c := range cascaded {
			tombstone := sync.Mutation{Table: c.table, ID: c.id, HLC: m.HLC}
			if _, err := appendChangeLog(ctx, tx, nil, tombstone, true); err != nil {
				return MutationResult{}, err
			}
		}
		if retiring {
			// The device that asked for the delete already drew its
			// cascade (ADR-031). Nothing was cascaded, so every child has
			// to be named again — alive — or a retired Vorlage comes back
			// with none of its positions.
			if res.Seq, err = relogCascadeChildren(ctx, tx, nil, m, res.Seq); err != nil {
				return MutationResult{}, err
			}
		}
		if m.Table == TableTrips && !row.Exists && !merged.Deleted {
			// The creator becomes the trip's Owner (FR-4.5); the membership
			// row syncs like any other so every device learns the roster.
			memberID := randomID()
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO trip_members (id, trip_id, user_id, role, updated_hlc) VALUES (?, ?, ?, ?, ?)`,
				memberID, m.ID, userID, RoleOwner, string(m.HLC)); err != nil {
				return MutationResult{}, fmt.Errorf("creator membership: %w", err)
			}
			member := sync.Mutation{Table: TableTripMembers, ID: memberID, HLC: m.HLC}
			if _, err := appendChangeLog(ctx, tx, nil, member, false); err != nil {
				return MutationResult{}, err
			}
		}
		if m.Table == TableTripMembers && !merged.Deleted {
			// A grant must resurface the trips row: the new member's pull
			// cursor is already past the trip's original change_log entry,
			// so without a fresh one they would never see the trip.
			if tripID, ok := memberTrip(row.Fields, m); ok {
				touch := sync.Mutation{Table: TableTrips, ID: tripID, HLC: m.HLC}
				if _, err := appendChangeLog(ctx, tx, nil, touch, false); err != nil {
					return MutationResult{}, err
				}
			}
		}
	}
	if err := logConflicts(ctx, tx, nil, userID, m, merged.Conflicts); err != nil {
		return MutationResult{}, err
	}
	return res, finalize(ctx, tx, res)
}

// finalize records the idempotency memo and commits.
func finalize(ctx context.Context, tx *sql.Tx, res MutationResult) error {
	if err := recordResult(ctx, tx, res); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// authorizeMaster decides whether userID may apply m and stamps
// server-owned columns on insert. current is the existing row, if any.
// It answers ReasonNone when the mutation may proceed and otherwise the
// reason it may not — the two structural rules (FR-27.1/27.6) refuse for a
// different reason than the permission rules, and the user is owed the
// difference.
func authorizeMaster(ctx context.Context, tx *sql.Tx, userID string, m *sync.Mutation, current map[string]any, exists bool) (RejectReason, error) {
	switch m.Table {
	case TableTags, TableItemTags:
		// Shared master data like the items they classify (FR-24.1): any
		// authenticated user creates a tag by typing it in M10, and there
		// is no separate tag-management screen to gate.
		return ReasonNone, nil

	case TableItems:
		if !exists && m.Op != sync.OpDelete {
			setField(m, "created_by", userID)
		}
		return ReasonNone, nil

	case TableItemDependencies:
		// Shared like the items they connect (FR-20.1): anyone may relate
		// two master items; invalid endpoints fail the FK and reject.
		return ReasonNone, nil

	case TableTemplates:
		// Shared instance-wide like master items (FR-1.6 MVP simplification,
		// 2026-08-08): everyone edits every template. owner_id is stamped
		// once as creator metadata and never rewritten afterwards — an
		// editor is not an owner, and the FR-1.6 stub needs the creator back
		// if the parked ownership model returns.
		if !exists && m.Op != sync.OpDelete {
			setField(m, "owner_id", userID)
			return ReasonNone, nil
		}
		if m.Op == sync.OpDelete {
			return ReasonNone, nil
		}
		return validKindSwitch(ctx, tx, current, m)

	case TableTemplateItems, TableTemplateItemTasks:
		// Positions and their preparation tasks (FR-27.7) follow their
		// template's governance (FR-1.6 MVP): shared. An invalid parent id
		// fails the FK and rejects.
		return ReasonNone, nil

	case TableTemplateIncludes:
		// Shared like everything else, but structurally constrained: the
		// two-level rule (FR-27.1) is what makes include cycles impossible,
		// so a shape that would break it is refused here rather than
		// discovered later by a resolver.
		if m.Op == sync.OpDelete {
			return ReasonNone, nil
		}
		return validInclude(ctx, tx, current, m)

	case TableTripSeries:
		if !exists {
			if m.Op != sync.OpDelete {
				setField(m, "owner_id", userID)
			}
			return ReasonNone, nil
		}
		return authorized(current["owner_id"] == userID), nil

	case TableDestinationProfiles:
		// Ownership follows the series chain (FR-13.2) — current and
		// target series alike, so profiles can't move to foreign series.
		return owned(ctx, tx, userID,
			`SELECT owner_id FROM trip_series WHERE id = ?`,
			parentIDs(current, m, "series_id"))

	case TableDestinationChecklistItems:
		return owned(ctx, tx, userID,
			`SELECT s.owner_id FROM destination_profiles p
			 JOIN trip_series s ON s.id = p.series_id WHERE p.id = ?`,
			parentIDs(current, m, "profile_id"))

	case TableTrips:
		if !exists {
			if m.Op != sync.OpDelete {
				setField(m, "created_by", userID)
			}
			return ReasonNone, nil
		}
		role, err := memberRole(ctx, tx, m.ID, userID)
		if err != nil {
			return ReasonNone, err
		}
		if role == "" {
			return ReasonNotAuthorized, nil
		}
		if m.Op == sync.OpDelete {
			return authorized(role == RoleOwner || role == RoleAdmin), nil
		}
		return ReasonNone, nil

	case TableTripTemplateSources, TableTripAppliedChanges:
		// FR-27.4 bookkeeping about a trip: writable by anyone who may edit
		// the trip itself. No role split — registering a source and logging
		// an applied change are consequences of ordinary editing, not
		// administration, and the refresh runs on whichever device has the
		// trip open.
		trips := parentIDs(current, m, columnTripID)
		if len(trips) == 0 {
			return ReasonNotAuthorized, nil
		}
		for tripID := range trips {
			role, err := memberRole(ctx, tx, tripID, userID)
			if err != nil {
				return ReasonNone, err
			}
			if role == "" {
				return ReasonNotAuthorized, nil
			}
		}
		return ReasonNone, nil

	case TableTripMembers:
		// Clients can never grant 'owner' — the creator's server-created
		// row is the trip's only Owner (FR-4.5).
		if role, ok := m.Fields["role"].(string); ok && role == RoleOwner {
			return ReasonNotAuthorized, nil
		}
		// The creator's row is the only one with role 'owner' and is
		// immutable — no demotion, no removal, not even by an Admin
		// (FR-4.7).
		if exists && current["role"] == RoleOwner {
			return ReasonNotAuthorized, nil
		}
		trips := parentIDs(current, m, columnTripID)
		if len(trips) == 0 {
			return ReasonNotAuthorized, nil
		}
		for tripID := range trips {
			role, err := memberRole(ctx, tx, tripID, userID)
			if err != nil {
				return ReasonNone, err
			}
			if role != RoleOwner && role != RoleAdmin {
				return ReasonNotAuthorized, nil // FR-4.7: only Owner/Admin manage members
			}
		}
		return ReasonNone, nil
	}
	return ReasonNotAuthorized, nil
}

// memberRole returns userID's role on the trip, or "" for non-members.
func memberRole(ctx context.Context, tx *sql.Tx, tripID, userID string) (string, error) {
	var role string
	err := tx.QueryRowContext(ctx,
		`SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?`,
		tripID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("trip role lookup: %w", err)
	}
	return role, nil
}

// parentIDs collects the parent references of a child row from both the
// existing row and the mutation fields — authorization must hold for the
// current parent *and* the target parent.
// validInclude enforces the FR-27.1 two-level rule: only a Ferien-Vorlage
// (kind 'template') may include, and only a Gruppe (kind 'group') may be
// included. Both ends are checked against the row as it will read after the
// mutation, so an include can never be re-pointed into an illegal shape.
// A missing template denies — the FK would reject it anyway, and denying
// keeps the answer a clean "rejected" instead of an error.
func validInclude(ctx context.Context, tx *sql.Tx, current map[string]any, m *sync.Mutation) (RejectReason, error) {
	field := func(name string) string {
		if v, ok := m.Fields[name].(string); ok {
			return v
		}
		if v, ok := current[name].(string); ok {
			return v
		}
		return ""
	}
	parent, child := field("template_id"), field("included_template_id")
	if parent == "" || child == "" {
		return ReasonTemplateScope, nil
	}
	for _, want := range []struct{ id, kind string }{{parent, KindTemplate}, {child, KindGroup}} {
		var kind string
		err := tx.QueryRowContext(ctx, `SELECT kind FROM templates WHERE id = ?`, want.id).Scan(&kind)
		if errors.Is(err, sql.ErrNoRows) {
			return ReasonTemplateScope, nil
		}
		if err != nil {
			return ReasonNone, fmt.Errorf("include scope lookup: %w", err)
		}
		if kind != want.kind {
			return ReasonTemplateScope, nil
		}
	}
	return ReasonNone, nil
}

// validKindSwitch enforces the two FR-27.6 scope guards on the push path,
// where the M8 editor's own guards cannot reach: a Ferien-Vorlage that
// still includes groups may not become a Gruppe, and a Gruppe that is
// included somewhere may not be promoted. Without them the FR-27.1
// two-level rule is a two-step formality — flip both ends of an edge and
// `validInclude` accepts the reverse edge, persisting a cycle.
//
// Only a mutation that actually *changes* the scope is judged. A push
// carrying no `kind`, or restating the one already stored, is an ordinary
// edit: rejecting it would drop a legitimate offline rename, and a
// rejected mutation is a change the client's outbox discards (NFR-4.2a).
func validKindSwitch(ctx context.Context, tx *sql.Tx, current map[string]any, m *sync.Mutation) (RejectReason, error) {
	kind, ok := m.Fields["kind"].(string)
	if !ok || kind == current["kind"] {
		return ReasonNone, nil
	}
	query := `SELECT count(*) FROM template_includes WHERE included_template_id = ?`
	if kind == KindGroup {
		query = `SELECT count(*) FROM template_includes WHERE template_id = ?`
	}
	var edges int
	if err := tx.QueryRowContext(ctx, query, m.ID).Scan(&edges); err != nil {
		return ReasonNone, fmt.Errorf("scope switch lookup: %w", err)
	}
	if edges > 0 {
		return ReasonTemplateScope, nil
	}
	return ReasonNone, nil
}

// authorized turns a plain ownership answer into the reason vocabulary.
func authorized(ok bool) RejectReason {
	if ok {
		return ReasonNone
	}
	return ReasonNotAuthorized
}

// owned is ownsAll in the reason vocabulary, so the switch above reads the
// same whichever branch answers.
func owned(ctx context.Context, tx *sql.Tx, userID, ownerQuery string, ids map[string]bool) (RejectReason, error) {
	ok, err := ownsAll(ctx, tx, userID, ownerQuery, ids)
	if err != nil {
		return ReasonNone, err
	}
	return authorized(ok), nil
}

// blockingReference is one child column that refuses its parent's delete,
// i.e. a foreign key deliberately declared without ON DELETE.
type blockingReference struct {
	table  string
	column string
}

// blockingReferences lists, per deletable table, the references that keep a
// row alive. It exists so the refusal can be *asked for* instead of inferred
// from a driver error string, which is not a stable contract across driver
// versions (CODING_PRINCIPLES §4a: the situation is named once, here).
//
// Only the restricting foreign keys belong here — a reference declared
// ON DELETE CASCADE takes the child with the parent and blocks nothing, and
// cascadeChildren is the list of those.
var blockingReferences = map[string][]blockingReference{
	// FR-9.2: an archived trip keeps naming the Vorlage its rows came from,
	// so the Vorlage cannot be deleted while any trip item names it.
	TableTemplates: {
		{TableTripItems, "source_template_id"},
	},
	TableItems: {
		{TableTemplateItems, "item_id"},
		{TableTripItems, "source_item_id"},
	},
	TableTripSeries: {
		{TableTrips, "series_id"},
	},
	TableTravelers: {
		{TableTripItems, "assigned_traveler_id"},
		{TableContainers, "carrier_traveler_id"},
	},
	TableContainers: {
		{TableTripItems, "container_id"},
		{TableContainers, "paired_container_id"},
	},
}

// retireInstead turns a delete FR-24.3 will not perform into the write that
// records the decision behind it: the row survives, the marker is stamped,
// and the mutation keeps its own id and clock so the merge treats it as the
// ordinary single-field write it now is.
func retireInstead(m sync.Mutation, at string) sync.Mutation {
	m.Op = sync.OpUpsert
	m.Fields = map[string]any{RetiredColumn: at}
	return m
}

// stillReferenced reports whether m's delete would be refused because rows
// elsewhere still point at the row. Nothing but a delete of an existing row
// can be blocked, so everything else answers false without a query.
func stillReferenced(ctx context.Context, tx *sql.Tx, m sync.Mutation, deleted, exists bool) (bool, error) {
	if !deleted || !exists {
		return false, nil
	}
	for _, ref := range blockingReferences[m.Table] {
		// A self-reference does not keep its own row alive: SQLite drops the
		// row and the pointer together, and counting it would refuse every
		// delete of a paired container.
		query := fmt.Sprintf(`SELECT count(*) FROM %s WHERE %s = ?`, ref.table, ref.column)
		if ref.table == m.Table {
			query += ` AND id <> ?`
		}
		args := []any{m.ID}
		if ref.table == m.Table {
			args = append(args, m.ID)
		}
		var refs int
		if err := tx.QueryRowContext(ctx, query, args...).Scan(&refs); err != nil {
			return false, fmt.Errorf("reference lookup on %s.%s: %w", ref.table, ref.column, err)
		}
		if refs > 0 {
			return true, nil
		}
	}
	return false, nil
}

func parentIDs(current map[string]any, m *sync.Mutation, field string) map[string]bool {
	ids := map[string]bool{}
	if id, ok := current[field].(string); ok {
		ids[id] = true
	}
	if id, ok := m.Fields[field].(string); ok {
		ids[id] = true
	}
	return ids
}

// ownsAll reports whether ownerQuery resolves to userID for every id.
// An empty id set or a missing parent row denies.
func ownsAll(ctx context.Context, tx *sql.Tx, userID, ownerQuery string, ids map[string]bool) (bool, error) {
	if len(ids) == 0 {
		return false, nil
	}
	for id := range ids {
		var owner string
		err := tx.QueryRowContext(ctx, ownerQuery, id).Scan(&owner)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, fmt.Errorf("owner lookup: %w", err)
		}
		if owner != userID {
			return false, nil
		}
	}
	return true, nil
}

func setField(m *sync.Mutation, field, value string) {
	if m.Fields == nil {
		m.Fields = map[string]any{}
	}
	m.Fields[field] = value
}

// cascadeRow identifies one child row an FK cascade will delete.
type cascadeRow struct{ table, id string }

// childQuery names one child table and the query that finds its rows for a
// parent id. `?1` may repeat — an include hangs off both of its endpoints.
type childQuery struct{ table, query string }

// cascadeChildren returns the child rows a delete will cascade to, in
// leaf-first order so clients can apply the tombstones verbatim.
func cascadeChildren(ctx context.Context, tx *sql.Tx, m sync.Mutation, deleted, exists bool) ([]cascadeRow, error) {
	if !deleted || !exists {
		return nil, nil
	}
	// The queries per parent table, in the order their tombstones must be
	// emitted: a child before the parent it hangs off, always.
	var children []childQuery
	switch m.Table {
	case TableTemplates:
		children = []childQuery{
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
		}
	case TableTrips:
		// A deleted trip takes three master-partition tables with it. They
		// need tombstones of their own precisely because the trip's *other*
		// children cannot have any: change_log.trip_id cascades too, so the
		// trip partition's whole feed is deleted with the row it describes,
		// and only the master feed survives to carry the news.
		children = []childQuery{
			{TableTripMembers, `SELECT id FROM trip_members WHERE trip_id = ?`},
			{TableTripTemplateSources, `SELECT id FROM trip_template_sources WHERE trip_id = ?`},
			{TableTripAppliedChanges, `SELECT id FROM trip_applied_changes WHERE trip_id = ?`},
		}
	case TableTemplateItems:
		children = []childQuery{
			{TableTemplateItemTasks, `SELECT id FROM template_item_tasks WHERE template_item_id = ?`},
		}
	case TableItems:
		children = []childQuery{
			{TableItemTags, `SELECT id FROM item_tags WHERE item_id = ?`},
			{TableItemDependencies,
				`SELECT id FROM item_dependencies WHERE item_id = ?1 OR depends_on_item_id = ?1`},
		}
	case TableTags:
		// A deleted tag unassigns itself everywhere (FR-24.1). Without the
		// tombstones a client keeps grouping items under a heading the
		// server no longer has.
		children = []childQuery{
			{TableItemTags, `SELECT id FROM item_tags WHERE tag_id = ?`},
		}
	case TableTripSeries:
		children = []childQuery{
			{TableDestinationChecklistItems, `SELECT ci.id FROM destination_checklist_items ci
			 JOIN destination_profiles p ON p.id = ci.profile_id WHERE p.series_id = ?`},
			{TableDestinationProfiles, `SELECT id FROM destination_profiles WHERE series_id = ?`},
		}
	case TableDestinationProfiles:
		children = []childQuery{
			{TableDestinationChecklistItems, `SELECT id FROM destination_checklist_items WHERE profile_id = ?`},
		}
	case TableTripItems:
		// The one cascade of the *trip* partition: a row's comments and
		// FR-7.3 todos hang off it (comments.trip_item_id ON DELETE
		// CASCADE). Trip-level comments have a NULL trip_item_id and are
		// untouched by the delete, so the query names the row explicitly
		// rather than matching on the trip.
		children = []childQuery{
			{TableComments, `SELECT id FROM comments WHERE trip_item_id = ?`},
		}
	}

	var rows []cascadeRow
	for _, child := range children {
		ids, err := childIDs(ctx, tx, child.query, m.ID)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			rows = append(rows, cascadeRow{child.table, id})
		}
	}
	return rows, nil
}

func childIDs(ctx context.Context, tx *sql.Tx, query string, args ...any) ([]string, error) {
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("child ids: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan child id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// isConstraintViolation matches FK, UNIQUE, and CHECK failures — all
// cases where the client's data, not the server, is at fault.
func isConstraintViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "constraint failed")
}

// memberTrip resolves a trip_members mutation's trip id from the
// existing row or the mutation fields.
func memberTrip(current map[string]any, m sync.Mutation) (string, bool) {
	if id, ok := m.Fields[columnTripID].(string); ok && id != "" {
		return id, true
	}
	if id, ok := current[columnTripID].(string); ok && id != "" {
		return id, true
	}
	return "", false
}

// PullMaster returns master-partition changes after the cursor, filtered
// to what userID may see (spec §4): tags, items and templates are
// instance-wide (FR-1.6 MVP), trips require membership, series follow
// ownership. Tombstones are always delivered — they carry only the entity
// id.
func (s *Store) PullMaster(ctx context.Context, userID string, cursor int64, limit int) (PullPage, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT seq, entity_table, entity_id, deleted FROM change_log
		 WHERE trip_id IS NULL AND seq > ? ORDER BY seq LIMIT ?`,
		cursor, limit+1)
	if err != nil {
		return PullPage{}, fmt.Errorf("pull master change_log: %w", err)
	}
	defer rows.Close()

	entries, err := scanChanges(rows)
	if err != nil {
		return PullPage{}, err
	}

	page := PullPage{HasMore: len(entries) > limit}
	if page.HasMore {
		entries = entries[:limit]
	}
	if len(entries) > 0 {
		page.NextCursor = entries[len(entries)-1].Seq
	} else {
		page.NextCursor = cursor
	}

	for _, c := range compact(entries) {
		if !c.Deleted {
			visible, err := s.masterVisible(ctx, userID, c.Table, c.ID)
			if err != nil {
				return PullPage{}, err
			}
			if !visible {
				continue
			}
			c.Row, err = s.loadSnapshot(ctx, c.Table, c.ID)
			if err != nil {
				return PullPage{}, err
			}
		}
		page.Changes = append(page.Changes, c)
	}
	return page, nil
}

// HeadSeqMaster returns the highest master-partition change_log sequence,
// or 0 if there are no master changes yet.
func (s *Store) HeadSeqMaster(ctx context.Context) (int64, error) {
	var seq int64
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(seq), 0) FROM change_log WHERE trip_id IS NULL`).Scan(&seq)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return seq, err
}

func (s *Store) masterVisible(ctx context.Context, userID, table, id string) (bool, error) {
	switch table {
	case TableTags, TableItemTags, TableItems, TableItemDependencies:
		return true, nil

	case TableTemplates, TableTemplateItems, TableTemplateIncludes, TableTemplateItemTasks:
		// Instance-wide, like the master items they are built from (FR-1.6
		// MVP simplification, 2026-08-08 — "Jeder sieht einfach alles").
		return true, nil

	case TableTrips:
		return s.IsTripMember(ctx, id, userID)

	case TableTripMembers:
		// The roster is visible to every member of its trip — including
		// the row's subject, who becomes a member through this very row.
		var tripID string
		err := s.db.QueryRowContext(ctx,
			`SELECT trip_id FROM trip_members WHERE id = ?`, id).Scan(&tripID)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, fmt.Errorf("trip_members visibility: %w", err)
		}
		return s.IsTripMember(ctx, tripID, userID)

	case TableTripTemplateSources:
		return s.tripScopedVisible(ctx, userID,
			`SELECT trip_id FROM trip_template_sources WHERE id = ?`, id)

	case TableTripAppliedChanges:
		return s.tripScopedVisible(ctx, userID,
			`SELECT trip_id FROM trip_applied_changes WHERE id = ?`, id)

	case TableTripSeries:
		return s.ownedBy(ctx, userID,
			`SELECT owner_id FROM trip_series WHERE id = ?`, id)

	case TableDestinationProfiles:
		return s.ownedBy(ctx, userID,
			`SELECT s.owner_id FROM destination_profiles p
			 JOIN trip_series s ON s.id = p.series_id WHERE p.id = ?`, id)

	case TableDestinationChecklistItems:
		return s.ownedBy(ctx, userID,
			`SELECT s.owner_id FROM destination_checklist_items ci
			 JOIN destination_profiles p ON p.id = ci.profile_id
			 JOIN trip_series s ON s.id = p.series_id WHERE ci.id = ?`, id)
	}
	return false, nil
}

// tripScopedVisible resolves query's single trip_id column for id and lets
// every member of that trip see the row (FR-27.4). A missing row denies —
// its tombstone follows in the feed, exactly as for trip_members.
func (s *Store) tripScopedVisible(ctx context.Context, userID, query, id string) (bool, error) {
	var tripID string
	err := s.db.QueryRowContext(ctx, query, id).Scan(&tripID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("trip-scoped visibility: %w", err)
	}
	return s.IsTripMember(ctx, tripID, userID)
}

// ownedBy resolves query's single owner column for id and compares it to
// userID; a missing row denies (its tombstone follows in the feed).
func (s *Store) ownedBy(ctx context.Context, userID, query, id string) (bool, error) {
	var owner string
	err := s.db.QueryRowContext(ctx, query, id).Scan(&owner)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("ownership visibility: %w", err)
	}
	return owner == userID, nil
}
