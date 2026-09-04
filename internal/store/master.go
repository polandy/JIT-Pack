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

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"

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
	return s.applyMutation(ctx, m, masterPartition(userID))
}

// masterAfterChange writes the three extra change_log entries only the
// master partition owes, each of them a row a device would otherwise never
// learn about.
func masterAfterChange(ctx context.Context, tx *sql.Tx, p partition, w writeOutcome) (int64, error) {
	seq := w.seq
	if w.retired {
		// The device that asked for the delete already drew its cascade
		// (ADR-031). Nothing was cascaded, so every child has to be named
		// again — alive — or a retired Vorlage comes back with none of its
		// positions.
		var err error
		if seq, err = relogCascadeChildren(ctx, tx, p.feed, w.m, seq); err != nil {
			return 0, err
		}
	}
	if w.m.Table == TableTrips && !w.row.Exists && !w.deleted {
		// The creator becomes the trip's Owner (FR-4.5); the membership row
		// syncs like any other so every device learns the roster.
		memberID := randomID()
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO trip_members (id, trip_id, user_id, role, updated_hlc) VALUES (?, ?, ?, ?, ?)`,
			memberID, w.m.ID, p.actorID, RoleOwner, string(w.m.HLC)); err != nil {
			return 0, fmt.Errorf("creator membership: %w", err)
		}
		member := sync.Mutation{Table: TableTripMembers, ID: memberID, HLC: w.m.HLC}
		if _, err := appendChangeLog(ctx, tx, p.feed, member, false); err != nil {
			return 0, err
		}
	}
	if w.m.Table == TableTripMembers && !w.deleted {
		// A grant must resurface the trips row: the new member's pull cursor
		// is already past the trip's original change_log entry, so without a
		// fresh one they would never see the trip.
		if tripID, ok := memberTrip(w.row.Fields, w.m); ok {
			touch := sync.Mutation{Table: TableTrips, ID: tripID, HLC: w.m.HLC}
			if _, err := appendChangeLog(ctx, tx, p.feed, touch, false); err != nil {
				return 0, err
			}
		}
	}
	return seq, nil
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
			m.Set("created_by", userID)
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
			m.Set("owner_id", userID)
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
				m.Set("owner_id", userID)
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
				m.Set("created_by", userID)
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

// cascadeRow identifies one child row an FK cascade will delete.
type cascadeRow struct{ table, id string }

// cascadeChildren returns the child rows a delete will cascade to, in
// leaf-first order so clients can apply the tombstones verbatim.
func cascadeChildren(ctx context.Context, tx *sql.Tx, m sync.Mutation, deleted, exists bool) ([]cascadeRow, error) {
	if !deleted || !exists {
		return nil, nil
	}
	var rows []cascadeRow
	for _, child := range tableSpecs[m.Table].cascades {
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
//
// Read from the driver's result code rather than from its message, for the
// reason partition.go states about the same failure: a message is not a
// contract to branch on. SQLite's result codes are — they are part of its
// documented interface, and every constraint failure carries SQLITE_CONSTRAINT
// in the low byte with the *kind* of constraint in the high bits
// (SQLITE_CONSTRAINT_FOREIGNKEY, _CHECK, _UNIQUE …), which is why the code is
// masked rather than compared whole.
func isConstraintViolation(err error) bool {
	var sqliteErr *sqlite.Error
	return errors.As(err, &sqliteErr) && sqliteErr.Code()&resultCodeMask == sqlite3.SQLITE_CONSTRAINT
}

// resultCodeMask keeps the primary result code out of an extended one:
// SQLite packs the detail into the bits above the low byte.
const resultCodeMask = 0xff

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
