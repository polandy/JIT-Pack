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

func TestStampActor_DayEntryAuthorIsThePusher_FR29_15(t *testing.T) {
	srv := newTestServer(t)
	pushOne(t, srv.URL, userB, map[string]any{
		"mutation_id": "de-1", "op": "insert", "table": "day_entries", "id": "de-forge",
		"fields": map[string]any{"trip_id": trip, "author_id": userA, "on_date": "2026-07-14", "title": "Mietauto abholen"},
		"hlc":    "0000000001000-0000-aaaaaaaa",
	})

	row := pullRow(t, srv.URL, userA, "day_entries", "de-forge")
	if row["author_id"] != userB {
		t.Errorf("author_id = %v, want %s — a day entry is stamped to its pusher", row["author_id"], userB)
	}
}

// FR-29.18: a connection travels like any day entry — its legs one JSON
// string, carried to the other travellers as it was written.
func TestSync_ADayConnectionReachesTheOthers_FR29_18(t *testing.T) {
	srv := newTestServer(t)
	legs := `[{"from":"Samedan","to":"Bern","dep":"2026-07-14T10:58","arr":"2026-07-14T15:28","line":"IC 1"}]`
	pushOne(t, srv.URL, userB, map[string]any{
		"mutation_id": "dc-1", "op": "insert", "table": "day_entries", "id": "dc-1",
		"fields": map[string]any{
			"trip_id": trip, "author_id": userB, "kind": "connection", "on_date": "2026-07-14", "at_time": "10:58",
			"title": "Samedan → Bern", "link": "https://a.sbbmobile.ch/s/73oNRti7", "legs": legs,
		},
		"hlc": "0000000001000-0000-aaaaaaaa",
	})

	row := pullRow(t, srv.URL, userA, "day_entries", "dc-1")
	if row["kind"] != "connection" || row["legs"] != legs || row["link"] != "https://a.sbbmobile.ch/s/73oNRti7" {
		t.Errorf("row = %v, want the connection with its legs and link", row)
	}
}
