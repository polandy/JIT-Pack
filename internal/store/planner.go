package store

import "jitpack/internal/sync"

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
