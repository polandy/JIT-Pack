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
