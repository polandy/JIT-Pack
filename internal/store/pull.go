// Package store — pull.go holds the one pagination both sync partitions
// serve their pull from, and the two public entry points that parametrise
// it (Sync-API §4).
//
// Cursor, limit+1/HasMore, NextCursor, compaction and the snapshot loop
// were written out twice, once per partition. Their only real differences
// are which feed the page reads and what the puller may see of it — and
// both of those are now arguments rather than a second copy.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// Change is one entry of a pull page (Sync-API Spec §4).
type Change struct {
	Seq     int64
	Table   string
	ID      string
	Deleted bool
	Row     map[string]any
}

// PullPage is the pull response envelope.
type PullPage struct {
	Changes    []Change
	NextCursor int64
	HasMore    bool
}

// pullFilter answers, for one live (non-tombstone) entry of a page, what
// the pull does with it. The two answers are separate on purpose: an entry
// the puller may not see is dropped from the page entirely, while a visible
// entry whose table carries no syncable columns is still delivered — with
// no row, because there is none to send.
//
// Tombstones never reach a filter: they carry only the entity id, so there
// is nothing to withhold and no snapshot to load.
type pullFilter func(ctx context.Context, table, id string) (visible, snapshot bool, err error)

// pullPage serves one page of f's change feed: entries after cursor, at
// most limit of them, compacted to the latest entry per entity and
// resolved to full row snapshots through filter.
func (s *Store) pullPage(ctx context.Context, f feed, filter pullFilter, cursor int64, limit int) (PullPage, error) {
	where, args := f.where()
	rows, err := s.db.QueryContext(ctx,
		`SELECT seq, entity_table, entity_id, deleted FROM change_log
		 WHERE `+where+` AND seq > ? ORDER BY seq LIMIT ?`,
		append(args, cursor, limit+1)...)
	if err != nil {
		return PullPage{}, fmt.Errorf("pull change_log: %w", err)
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
	// The cursor advances over the *whole* page, including entries the
	// filter drops — they are read and decided, so a client that pulled
	// them must not be handed them again.
	if len(entries) > 0 {
		page.NextCursor = entries[len(entries)-1].Seq
	} else {
		page.NextCursor = cursor
	}

	for _, c := range compact(entries) {
		if !c.Deleted {
			visible, snapshot, err := filter(ctx, c.Table, c.ID)
			if err != nil {
				return PullPage{}, err
			}
			if !visible {
				continue
			}
			if snapshot {
				if c.Row, err = s.loadSnapshot(ctx, c.Table, c.ID); err != nil {
					return PullPage{}, err
				}
			}
		}
		page.Changes = append(page.Changes, c)
	}
	return page, nil
}

// Pull returns change_log entries after the cursor as full row snapshots,
// compacted to the latest entry per entity within the page.
func (s *Store) Pull(ctx context.Context, tripID string, cursor int64, limit int) (PullPage, error) {
	return s.pullPage(ctx, tripFeed(tripID), tripVisible, cursor, limit)
}

// tripVisible is the trip partition's pull filter: membership is the whole
// gate and the handler already applied it, so everything in the feed is
// visible to whoever may read the feed at all.
func tripVisible(_ context.Context, table, _ string) (bool, bool, error) {
	_, syncable := syncableColumns[table]
	return true, syncable, nil
}

// PullMaster returns master-partition changes after the cursor, filtered
// to what userID may see (spec §4): tags, items and templates are
// instance-wide (FR-1.6 MVP), trips require membership, series follow
// ownership. Tombstones are always delivered — they carry only the entity
// id.
func (s *Store) PullMaster(ctx context.Context, userID string, cursor int64, limit int) (PullPage, error) {
	filter := func(ctx context.Context, table, id string) (bool, bool, error) {
		visible, err := s.masterVisible(ctx, userID, table, id)
		return visible, true, err
	}
	return s.pullPage(ctx, masterFeed, filter, cursor, limit)
}

// HeadSeq returns the highest change_log sequence number for a trip,
// or 0 if the trip has no changes yet. Used by the WebSocket hub to
// compute in_sync state (Sync-API Spec §7).
func (s *Store) HeadSeq(ctx context.Context, tripID string) (int64, error) {
	return s.headSeq(ctx, tripFeed(tripID))
}

// HeadSeqMaster returns the highest master-partition change_log sequence,
// or 0 if there are no master changes yet.
func (s *Store) HeadSeqMaster(ctx context.Context) (int64, error) {
	return s.headSeq(ctx, masterFeed)
}

func (s *Store) headSeq(ctx context.Context, f feed) (int64, error) {
	where, args := f.where()
	var seq int64
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(seq), 0) FROM change_log WHERE `+where, args...).Scan(&seq)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return seq, err
}

func scanChanges(rows *sql.Rows) ([]Change, error) {
	var entries []Change
	for rows.Next() {
		var c Change
		var deleted int
		if err := rows.Scan(&c.Seq, &c.Table, &c.ID, &deleted); err != nil {
			return nil, fmt.Errorf("scan change: %w", err)
		}
		c.Deleted = deleted == 1
		entries = append(entries, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate changes: %w", err)
	}
	return entries, nil
}

// compact keeps only the latest change per entity, preserving seq order —
// the pull row is a full snapshot, so earlier entries carry no information.
func compact(entries []Change) []Change {
	latest := map[string]int64{}
	for _, c := range entries {
		latest[c.Table+"/"+c.ID] = c.Seq
	}
	out := make([]Change, 0, len(latest))
	for _, c := range entries {
		if latest[c.Table+"/"+c.ID] == c.Seq {
			out = append(out, c)
		}
	}
	return out
}

// loadSnapshot reads the pull representation of one row: its syncable
// columns plus updatedHLCColumn, which is not one of them. The clock is
// added here rather than by each caller because it is part of what a
// snapshot *is* — Sync-API §3 has every pulling client advance its own
// clock past it, and a snapshot without it silently disables that rule.
func (s *Store) loadSnapshot(ctx context.Context, table, id string) (map[string]any, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("begin snapshot read: %w", err)
	}
	defer tx.Rollback()
	row, err := loadRow(ctx, tx, table, id)
	if err != nil {
		return nil, err
	}
	if !row.Exists {
		return nil, nil
	}
	row.Fields[updatedHLCColumn] = string(row.HLC)
	return row.Fields, nil
}
