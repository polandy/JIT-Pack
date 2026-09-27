package api_test

import "testing"

// Invariant 3 for the planner (FR-29.1/29.3/29.4): an idea's author, a
// discussion entry's author and a vote's voter are the pusher's, whatever
// the mutation names.

func pushIdea(t *testing.T, srv, user, id string) {
	t.Helper()
	pushOne(t, srv, user, map[string]any{
		"mutation_id": "idea-" + id, "op": "insert", "table": "ideas", "id": id,
		"fields": map[string]any{"trip_id": trip, "author_id": "user-x", "title": "Bootsausflug Cala Luna", "state": "idea"},
		"hlc":    "0000000001000-0000-aaaaaaaa",
	})
}

func TestStampActor_IdeaAuthorIsThePusher_FR29_1(t *testing.T) {
	srv := newTestServer(t)
	pushIdea(t, srv.URL, userB, "idea-forge")

	row := pullRow(t, srv.URL, userA, "ideas", "idea-forge")
	if row["author_id"] != userB {
		t.Errorf("author_id = %v, want %s — an idea is stamped to its pusher", row["author_id"], userB)
	}
}

func TestStampActor_IdeaCommentAuthorIsThePusher_FR29_4(t *testing.T) {
	srv := newTestServer(t)
	pushIdea(t, srv.URL, userA, "idea-1")
	pushOne(t, srv.URL, userB, map[string]any{
		"mutation_id": "ic-1", "op": "insert", "table": "idea_comments", "id": "ic-forge",
		"fields": map[string]any{"trip_id": trip, "idea_id": "idea-1", "author_id": userA, "body": "Nur mit Guide"},
		"hlc":    "0000000002000-0000-bbbbbbbb",
	})

	row := pullRow(t, srv.URL, userA, "idea_comments", "ic-forge")
	if row["author_id"] != userB {
		t.Errorf("author_id = %v, want %s — a word about an idea is its pusher's", row["author_id"], userB)
	}
}

func TestStampActor_VoteCannotBeCastInAnotherName_FR29_3(t *testing.T) {
	srv := newTestServer(t)
	pushIdea(t, srv.URL, userA, "idea-1")
	pushOne(t, srv.URL, userB, map[string]any{
		"mutation_id": "v-1", "op": "insert", "table": "idea_votes", "id": "vote-forge",
		"fields": map[string]any{"trip_id": trip, "idea_id": "idea-1", "user_id": userA, "vote": "up"},
		"hlc":    "0000000002000-0000-bbbbbbbb",
	})

	row := pullRow(t, srv.URL, userA, "idea_votes", "vote-forge")
	if row["user_id"] != userB {
		t.Errorf("user_id = %v, want %s — a vote is stamped to the pusher", row["user_id"], userB)
	}
}

func TestStampActor_VoteUpsertCannotTakeOverAnotherUsersVote_FR29_3(t *testing.T) {
	srv := newTestServer(t)
	pushIdea(t, srv.URL, userA, "idea-1")
	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "v-2", "op": "insert", "table": "idea_votes", "id": "vote-a",
		"fields": map[string]any{"trip_id": trip, "idea_id": "idea-1", "vote": "up"},
		"hlc":    "0000000002000-0000-aaaaaaaa",
	})

	outcome := pushOutcome(t, srv.URL, userB, map[string]any{
		"mutation_id": "v-3", "op": "upsert", "table": "idea_votes", "id": "vote-a",
		"fields": map[string]any{"user_id": userB, "vote": "down"},
		"hlc":    "0000000003000-0000-bbbbbbbb",
	})
	if outcome != "rejected" {
		t.Errorf("outcome = %q, want rejected", outcome)
	}
	row := pullRow(t, srv.URL, userA, "idea_votes", "vote-a")
	if row["user_id"] != userA || row["vote"] != "up" {
		t.Errorf("row = %v, want user-a's 👍 untouched", row)
	}
}
