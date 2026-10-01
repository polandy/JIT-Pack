package store

import (
	"context"
	"fmt"

	"jitpack/internal/sync"
)

// IdeaStateShortlisted is the state an idea is in once it made the shortlist
// (FR-29.2) — the move FR-29.8 tells the trip about.
const IdeaStateShortlisted = "shortlisted"

// columnVoter is whose vote an idea_votes row is (FR-29.3), stamped by the
// server on the insert.
const columnVoter = "user_id"

// validIdeaVote is FR-29.3's part of the trip partition's write gate: a vote
// carries its voter's name (votes are open), so only that voter may, change or remove it. The server stamps the
// voter on the insert; this refuses every later op by somebody else, which
// the stamp alone cannot, because the row id is all a forged upsert needs.
func validIdeaVote(actorID string, row sync.Row) RejectReason {
	if !row.Exists {
		return ReasonNone
	}
	if voter, _ := row.Fields[columnVoter].(string); voter != actorID {
		return ReasonNotAuthorized
	}
	return ReasonNone
}

// ideaCommentWords are the fields an edit of a discussion entry changes —
// the ones only its author may send, since the entry carries their name.
var ideaCommentWords = []string{columnBody, columnEditedAt}

// validIdeaComment is FR-29.4's part of the trip partition's write gate: a
// word about an idea is its author's to change, as a trip note's is
// (validNoteThread). A delete stays everybody's, like a note's.
func validIdeaComment(actorID string, row sync.Row, m *sync.Mutation) RejectReason {
	if !row.Exists || m.Op == sync.OpDelete || !touchesAny(m.Fields, ideaCommentWords) {
		return ReasonNone
	}
	if author, _ := row.Fields[columnAuthorID].(string); author != actorID {
		return ReasonNotAuthorized
	}
	return ReasonNone
}

// columnPosition is where a picture stands among its idea's (FR-29.5).
const columnPosition = "position"

// validIdeaImage is FR-29.5's part of the trip partition's write gate. The
// upload creates a picture with its bytes (ADR-002), so a push may move one
// or delete it and nothing more: an insert would be a picture without bytes,
// and a changed hash or idea would point the row at bytes it does not have.
func validIdeaImage(row sync.Row, m *sync.Mutation) RejectReason {
	if m.Op == sync.OpDelete {
		return ReasonNone
	}
	if !row.Exists {
		return ReasonNotAuthorized
	}
	for field := range m.Fields {
		if field != columnPosition {
			return ReasonNotAuthorized
		}
	}
	return ReasonNone
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
func validTrack(row sync.Row, m *sync.Mutation) RejectReason {
	if m.Op == sync.OpDelete {
		return ReasonNone
	}
	if !row.Exists {
		return ReasonNotAuthorized
	}
	for field := range m.Fields {
		if !trackSettings[field] {
			return ReasonNotAuthorized
		}
	}
	return ReasonNone
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
