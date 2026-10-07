package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"jitpack/internal/sync"
)

// IdeaStateShortlisted is the state an idea is in once it made the shortlist
// (FR-29.2) — the move FR-29.8 tells the trip about.
const IdeaStateShortlisted = "shortlisted"

// columnIdeaID names, on an excursion, a task or a shopping entry, the idea
// it was made from (FR-29.13).
const columnIdeaID = "idea_id"

// validIdeaResult is FR-29.13's part of the trip partition's write gate: a
// result names an idea of its own trip. One deleted before the result
// arrived — on another device, while this one was offline — drops the link
// and keeps the result, which a foreign-key refusal would have thrown away;
// one of another trip is a write no screen of this trip can make. FR-7.15's
// noteExcursion, for the same reasons.
func validIdeaResult(ctx context.Context, tx *sql.Tx, in guardInput) (RejectReason, error) {
	tripID, m := in.tripID, in.m
	id, _ := m.Fields[columnIdeaID].(string)
	if id == "" {
		return ReasonNone, nil
	}
	var ideaTrip string
	err := tx.QueryRowContext(ctx, `SELECT trip_id FROM ideas WHERE id = ?`, id).Scan(&ideaTrip)
	if errors.Is(err, sql.ErrNoRows) {
		delete(m.Fields, columnIdeaID)
		return ReasonNone, nil
	}
	if err != nil {
		return ReasonNone, fmt.Errorf("idea result lookup: %w", err)
	}
	if ideaTrip != tripID {
		return ReasonConstraintViolated, nil
	}
	return ReasonNone, nil
}

// columnVoter is whose vote an idea_votes row is (FR-29.3), stamped by the
// server on the insert.
const columnVoter = "user_id"

// validIdeaVote is FR-29.3's part of the trip partition's write gate: a vote
// carries its voter's name (votes are open), so only that voter may, change or remove it. The server stamps the
// voter on the insert; this refuses every later op by somebody else, which
// the stamp alone cannot, because the row id is all a forged upsert needs.
func validIdeaVote(_ context.Context, _ *sql.Tx, in guardInput) (RejectReason, error) {
	if !in.row.Exists {
		return ReasonNone, nil
	}
	if voter, _ := in.row.Fields[columnVoter].(string); voter != in.actorID {
		return ReasonNotAuthorized, nil
	}
	return ReasonNone, nil
}

// ideaCommentWords are the fields an edit of a discussion entry changes —
// the ones only its author may send, since the entry carries their name.
var ideaCommentWords = []string{columnBody, columnEditedAt}

// validIdeaComment is FR-29.4's part of the trip partition's write gate: a
// word about an idea is its author's to change, as a trip note's is
// (validNoteThread). A delete stays everybody's, like a note's.
func validIdeaComment(_ context.Context, _ *sql.Tx, in guardInput) (RejectReason, error) {
	if !in.row.Exists || in.m.Op == sync.OpDelete || !touchesAny(in.m.Fields, ideaCommentWords) {
		return ReasonNone, nil
	}
	if author, _ := in.row.Fields[columnAuthorID].(string); author != in.actorID {
		return ReasonNotAuthorized, nil
	}
	return ReasonNone, nil
}

// columnPosition is where a picture stands among its idea's (FR-29.5).
const columnPosition = "position"

// validIdeaImage is FR-29.5's part of the trip partition's write gate. The
// upload creates a picture with its bytes (ADR-002), so a push may move one
// or delete it and nothing more: an insert would be a picture without bytes,
// and a changed hash or idea would point the row at bytes it does not have.
func validIdeaImage(_ context.Context, _ *sql.Tx, in guardInput) (RejectReason, error) {
	if in.m.Op == sync.OpDelete {
		return ReasonNone, nil
	}
	if !in.row.Exists {
		return ReasonNotAuthorized, nil
	}
	for field := range in.m.Fields {
		if field != columnPosition {
			return ReasonNotAuthorized, nil
		}
	}
	return ReasonNone, nil
}

// The columns of an idea's track (FR-29.17) that the store names more than
// once: what a person sets, and the line every screen draws.
const (
	columnName     = "name"
	columnKind     = "kind"
	columnWithKid  = "with_kid"
	columnPauseMin = "pause_min"
	columnLine     = "line"
)

// The columns of a day-plan connection (FR-29.18): the link it was read
// from — a name an idea's link shares — and its legs, one JSON array.
const (
	columnLink = "link"
	columnLegs = "legs"
)

// trackSettings are the fields of a track a push may change: what a person
// sets. Everything else is what the file says (ADR-085).
var trackSettings = map[string]bool{
	columnName: true, columnKind: true, columnWithKid: true, columnPauseMin: true, columnPosition: true,
}

// validTrack is FR-29.17's part of the trip partition's write gate, for an
// idea's tracks and an excursion's alike (FR-31.15). The upload creates a
// track with its file, so a push may change what a person
// sets or delete the track: an insert would be a track without its file, and
// a changed figure or line would no longer be what the file says.
func validTrack(_ context.Context, _ *sql.Tx, in guardInput) (RejectReason, error) {
	if in.m.Op == sync.OpDelete {
		return ReasonNone, nil
	}
	if !in.row.Exists {
		return ReasonNotAuthorized, nil
	}
	for field := range in.m.Fields {
		if !trackSettings[field] {
			return ReasonNotAuthorized, nil
		}
	}
	return ReasonNone, nil
}

// IdeaDiscussion is what FR-29.8's comment rule needs to know about an idea:
// what it is called, and who takes part in its discussion.
type IdeaDiscussion struct {
	// Title is the idea's title, which a notification names it by.
	Title string
	// Participants are the idea's author and then every commenter once, in
	// the order they first wrote. A vote does not make a participant.
	Participants []string
}

// IdeaDiscussion reads an idea's title and the people taking part in its
// discussion (FR-29.8).
func (s *Store) IdeaDiscussion(ctx context.Context, ideaID string) (IdeaDiscussion, error) {
	var discussion IdeaDiscussion
	var author string
	err := s.db.QueryRowContext(ctx, `SELECT title, author_id FROM ideas WHERE id = ?`, ideaID).
		Scan(&discussion.Title, &author)
	if err != nil {
		return IdeaDiscussion{}, fmt.Errorf("idea discussion %s: %w", ideaID, err)
	}
	discussion.Participants = []string{author}

	rows, err := s.db.QueryContext(ctx,
		`SELECT author_id FROM idea_comments WHERE idea_id = ?
		 GROUP BY author_id ORDER BY min(created_at), min(rowid)`, ideaID)
	if err != nil {
		return IdeaDiscussion{}, fmt.Errorf("idea discussion %s commenters: %w", ideaID, err)
	}
	defer rows.Close()
	for rows.Next() {
		var commenter string
		if err := rows.Scan(&commenter); err != nil {
			return IdeaDiscussion{}, fmt.Errorf("scan commenter: %w", err)
		}
		if commenter != author {
			discussion.Participants = append(discussion.Participants, commenter)
		}
	}
	return discussion, rows.Err()
}
