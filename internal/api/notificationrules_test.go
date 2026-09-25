package api

import (
	"strings"
	"testing"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

// notificationRuleMembers is the cast every case below shares: the actor
// plus two other people, so FR-17.3's solo short-circuit never fires by
// accident and a mention has somebody to land on.
var notificationRuleMembers = []store.MemberName{
	{UserID: "u-actor", DisplayName: "Andy"},
	{UserID: "u-sarah", DisplayName: "Sarah"},
	{UserID: "u-max", DisplayName: "Max Muster"},
}

// resolverFor answers from a map and reports false for anything else, which
// is how a case says "this item could not be read".
func resolverFor(items map[string]itemFacts) itemResolver {
	return func(itemID string) (itemFacts, bool) {
		f, ok := items[itemID]
		return f, ok
	}
}

// travelerResolverFor answers from a map and reports false for anything
// else, which is how a case says "this traveler is unlinked or unknown".
func travelerResolverFor(links map[string]string) travelerResolver {
	return func(travelerID string) (string, bool) {
		u, ok := links[travelerID]
		return u, ok
	}
}

// noTravelerLinks is the resolver for every case that is not about
// FR-2.5/ADR-058's roster-assignment rule.
func noTravelerLinks(string) (string, bool) { return "", false }

// noTodoBodies is the resolver for every case that is not about FR-7.5's
// trip-todo assignment rule.
func noTodoBodies(string) (string, bool) { return "", false }

// todoBodiesFor answers from a map and reports false for anything else,
// which is how a case says "this todo could not be read".
func todoBodiesFor(bodies map[string]string) todoResolver {
	return func(commentID string) (string, bool) {
		b, ok := bodies[commentID]
		return b, ok
	}
}

// noThreads is the resolver for every case that is not about FR-7.13's
// reply rule.
func noThreads(string) (noteThreadFacts, bool) { return noteThreadFacts{}, false }

// threadsFor answers from a map and reports false for anything else, which
// is how a case says "this thread could not be read".
func threadsFor(threads map[string]noteThreadFacts) threadResolver {
	return func(rootID string) (noteThreadFacts, bool) {
		f, ok := threads[rootID]
		return f, ok
	}
}

// allApplied is the result vector for n mutations that all landed, so a case
// that is not about outcomes does not have to spell one out.
func allApplied(n int) []MutationResult {
	out := make([]MutationResult, n)
	for i := range out {
		out[i] = MutationResult{Outcome: OutcomeApplied}
	}
	return out
}

func tripItemMutation(id string, fields map[string]any) syncpkg.Mutation {
	return syncpkg.Mutation{Op: syncpkg.OpUpsert, Table: store.TableTripItems, ID: id, Fields: fields}
}

func commentMutation(id string, fields map[string]any) syncpkg.Mutation {
	return syncpkg.Mutation{Op: syncpkg.OpInsert, Table: store.TableComments, ID: id, Fields: fields}
}

// recipients reduces a plan to "who got what", which is the part every rule
// below is actually about; payload contents get their own case.
func recipients(plan []plannedNotification) []string {
	out := make([]string, 0, len(plan))
	for _, p := range plan {
		out = append(out, p.UserID+"/"+p.Kind)
	}
	return out
}

func TestPlanNotifications_EveryFR62Trigger(t *testing.T) {
	const zelt = "ti-zelt"
	zeltPackedBySarah := map[string]itemFacts{zelt: {Name: "Zelt", PackerUserID: "u-sarah"}}
	zeltUnassigned := map[string]itemFacts{zelt: {Name: "Zelt"}}

	tests := []struct {
		name    string
		members []store.MemberName
		muts    []syncpkg.Mutation
		results []MutationResult
		items   map[string]itemFacts
		want    []string
	}{
		{
			name:  "FR-6.2 assigning the row to somebody else notifies them",
			muts:  []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			items: zeltUnassigned,
			want:  []string{"u-sarah/" + store.NotifyDelegation},
		},
		{
			name:  "FR-6.2 assigning the row to yourself notifies nobody",
			muts:  []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-actor"})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name:  "FR-6.2 clearing the assignment notifies nobody",
			muts:  []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": ""})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name:  "a trip_items write that is not an assignment notifies nobody",
			muts:  []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"qty": 2})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name:    "FR-17.3 a solo trip notifies nobody",
			members: []store.MemberName{{UserID: "u-actor", DisplayName: "Andy"}},
			muts:    []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			items:   zeltUnassigned,
			want:    nil,
		},
		{
			name:    "a rejected mutation notifies nobody",
			muts:    []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			results: []MutationResult{{Outcome: OutcomeRejected}},
			items:   zeltUnassigned,
			want:    nil,
		},
		{
			name:    "a duplicate mutation notifies nobody",
			muts:    []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			results: []MutationResult{{Outcome: OutcomeDuplicate}},
			items:   zeltUnassigned,
			want:    nil,
		},
		{
			name:    "a merged mutation still notifies, because it was applied in part",
			muts:    []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			results: []MutationResult{{Outcome: OutcomeMerged}},
			items:   zeltUnassigned,
			want:    []string{"u-sarah/" + store.NotifyDelegation},
		},
		{
			name:    "a mutation the push reported nothing for notifies nobody",
			muts:    []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			results: []MutationResult{},
			items:   zeltUnassigned,
			want:    nil,
		},
		{
			name:  "an item that cannot be read costs its delegation and nothing else",
			muts:  []syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			items: map[string]itemFacts{},
			want:  nil,
		},
		{
			// FR-7.9: trip-level and not a task is now a note, which
			// broadcasts rather than scanning for @mentions — so a mention
			// case has to anchor to a row to stay a mention case at all.
			name:  "FR-6.2 a mention reaches the member it names",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Sarah bring the poles", "trip_item_id": zelt})},
			items: zeltUnassigned,
			want:  []string{"u-sarah/" + store.NotifyMention},
		},
		{
			name:  "a mention of a name with a space still resolves",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "ping @max muster please", "trip_item_id": zelt})},
			items: zeltUnassigned,
			want:  []string{"u-max/" + store.NotifyMention},
		},
		{
			name:  "a longer name starting with a member's name is not that member",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Sarahs Zelt", "trip_item_id": zelt})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name:  "mentioning yourself notifies nobody",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Andy reminder", "trip_item_id": zelt})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name:  "the same member mentioned twice is notified once",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Sarah and @Sarah again", "trip_item_id": zelt})},
			items: zeltUnassigned,
			want:  []string{"u-sarah/" + store.NotifyMention},
		},
		{
			name:  "FR-7.9 a new trip note notifies every other member",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "Schlüsselfach: 4711"})},
			items: zeltUnassigned,
			want:  []string{"u-sarah/" + store.NotifyNote, "u-max/" + store.NotifyNote},
		},
		{
			name:  "FR-7.9 a note names nobody by @mention — the broadcast covers it already",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Sarah check the code"})},
			items: zeltUnassigned,
			want:  []string{"u-sarah/" + store.NotifyNote, "u-max/" + store.NotifyNote},
		},
		{
			name: "a trip todo (FR-7.4, is_task true, no row) is not a note",
			muts: []syncpkg.Mutation{commentMutation("c-1", map[string]any{
				"body": "Pflanzen giessen", "is_task": true, "task_state": "open",
			})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name: "FR-7.2 a task on an assigned row notifies its packer",
			muts: []syncpkg.Mutation{commentMutation("c-1", map[string]any{
				"body": "seal the seams", "trip_item_id": zelt, "is_task": true,
			})},
			items: zeltPackedBySarah,
			want:  []string{"u-sarah/" + store.NotifyTask},
		},
		{
			name: "FR-7.2 a comment that is not a task notifies no packer",
			muts: []syncpkg.Mutation{commentMutation("c-1", map[string]any{
				"body": "looks fine", "trip_item_id": zelt, "is_task": false,
			})},
			items: zeltPackedBySarah,
			want:  nil,
		},
		{
			name: "a task on an unassigned row notifies nobody",
			muts: []syncpkg.Mutation{commentMutation("c-1", map[string]any{
				"body": "seal the seams", "trip_item_id": zelt, "is_task": true,
			})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name: "a task on your own row notifies nobody",
			muts: []syncpkg.Mutation{commentMutation("c-1", map[string]any{
				"body": "seal the seams", "trip_item_id": zelt, "is_task": true,
			})},
			items: map[string]itemFacts{zelt: {Name: "Zelt", PackerUserID: "u-actor"}},
			want:  nil,
		},
		{
			name: "the packer who is also mentioned gets the task and not the mention",
			muts: []syncpkg.Mutation{commentMutation("c-1", map[string]any{
				"body": "@Sarah seal the seams", "trip_item_id": zelt, "is_task": true,
			})},
			items: zeltPackedBySarah,
			want:  []string{"u-sarah/" + store.NotifyTask},
		},
		{
			name: "a mention beside the task still reaches the other member",
			muts: []syncpkg.Mutation{commentMutation("c-1", map[string]any{
				"body": "@Sarah and @Max Muster", "trip_item_id": zelt, "is_task": true,
			})},
			items: zeltPackedBySarah,
			want:  []string{"u-sarah/" + store.NotifyTask, "u-max/" + store.NotifyMention},
		},
		{
			name: "an item that cannot be read costs the comment its mentions too",
			muts: []syncpkg.Mutation{commentMutation("c-1", map[string]any{
				"body": "@Sarah seal the seams", "trip_item_id": zelt, "is_task": true,
			})},
			items: map[string]itemFacts{},
			want:  nil,
		},
		{
			name: "a comment upsert that is not an insert is not a new comment",
			muts: []syncpkg.Mutation{{
				Op: syncpkg.OpUpsert, Table: store.TableComments, ID: "c-1",
				Fields: map[string]any{"body": "@Sarah bring the poles"},
			}},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name: "two mutations in one push each earn their own notification",
			muts: []syncpkg.Mutation{
				tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"}),
				commentMutation("c-1", map[string]any{"body": "@Max Muster look", "trip_item_id": zelt}),
			},
			items: zeltUnassigned,
			want:  []string{"u-sarah/" + store.NotifyDelegation, "u-max/" + store.NotifyMention},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			members := tc.members
			if members == nil {
				members = notificationRuleMembers
			}
			results := tc.results
			if results == nil {
				results = allApplied(len(tc.muts))
			}
			got := recipients(planNotifications("trip-1", "u-actor", tc.muts, results, members, resolverFor(tc.items), noTravelerLinks, noTodoBodies, noThreads))
			if len(got) != len(tc.want) {
				t.Fatalf("plan = %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("plan = %v, want %v", got, tc.want)
				}
			}
		})
	}
}

// TestPlanRosterAssignment_LinkedTravelerNotifiesTheirAccount and its
// siblings pin FR-2.5 → ADR-058: assigning a row to a traveler linked to
// an account notifies that account, the same way an explicit
// packer_user_id delegation would.
func TestPlanRosterAssignment_LinkedTravelerNotifiesTheirAccount(t *testing.T) {
	const zelt, traveler = "ti-zelt", "trv-sarah"
	resolve := resolverFor(map[string]itemFacts{zelt: {Name: "Zelt"}})
	resolveTraveler := travelerResolverFor(map[string]string{traveler: "u-sarah"})

	plan := planNotifications("trip-1", "u-actor",
		[]syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"assigned_traveler_id": traveler})},
		allApplied(1), notificationRuleMembers, resolve, resolveTraveler, noTodoBodies, noThreads)

	if got := recipients(plan); len(got) != 1 || got[0] != "u-sarah/"+store.NotifyDelegation {
		t.Fatalf("plan = %v, want one delegation to u-sarah", got)
	}
}

func TestPlanRosterAssignment_DedupsAgainstDelegation_WhenPackerIsTheSameLinkedUser(t *testing.T) {
	const zelt, traveler = "ti-zelt", "trv-sarah"
	resolve := resolverFor(map[string]itemFacts{zelt: {Name: "Zelt"}})
	resolveTraveler := travelerResolverFor(map[string]string{traveler: "u-sarah"})

	plan := planNotifications("trip-1", "u-actor",
		[]syncpkg.Mutation{tripItemMutation(zelt, map[string]any{
			"assigned_traveler_id": traveler, "packer_user_id": "u-sarah",
		})},
		allApplied(1), notificationRuleMembers, resolve, resolveTraveler, noTodoBodies, noThreads)

	if got := recipients(plan); len(got) != 1 || got[0] != "u-sarah/"+store.NotifyDelegation {
		t.Fatalf("plan = %v, want exactly one delegation to u-sarah, not two", got)
	}
}

func TestPlanRosterAssignment_UnlinkedTraveler_NoOp(t *testing.T) {
	const zelt, traveler = "ti-zelt", "trv-sarah"
	resolve := resolverFor(map[string]itemFacts{zelt: {Name: "Zelt"}})

	plan := planNotifications("trip-1", "u-actor",
		[]syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"assigned_traveler_id": traveler})},
		allApplied(1), notificationRuleMembers, resolve, noTravelerLinks, noTodoBodies, noThreads)

	if got := recipients(plan); len(got) != 0 {
		t.Fatalf("plan = %v, want nothing for an unlinked traveler", got)
	}
}

func TestPlanRosterAssignment_TargetNotATripMember_NoOp(t *testing.T) {
	const zelt, traveler = "ti-zelt", "trv-ghost"
	resolve := resolverFor(map[string]itemFacts{zelt: {Name: "Zelt"}})
	resolveTraveler := travelerResolverFor(map[string]string{traveler: "u-departed"})

	plan := planNotifications("trip-1", "u-actor",
		[]syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"assigned_traveler_id": traveler})},
		allApplied(1), notificationRuleMembers, resolve, resolveTraveler, noTodoBodies, noThreads)

	if got := recipients(plan); len(got) != 0 {
		t.Fatalf("plan = %v, want nothing for a linked user who left the trip", got)
	}
}

func TestPlanRosterAssignment_TargetIsActor_NoOp(t *testing.T) {
	const zelt, traveler = "ti-zelt", "trv-actor"
	resolve := resolverFor(map[string]itemFacts{zelt: {Name: "Zelt"}})
	resolveTraveler := travelerResolverFor(map[string]string{traveler: "u-actor"})

	plan := planNotifications("trip-1", "u-actor",
		[]syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"assigned_traveler_id": traveler})},
		allApplied(1), notificationRuleMembers, resolve, resolveTraveler, noTodoBodies, noThreads)

	if got := recipients(plan); len(got) != 0 {
		t.Fatalf("plan = %v, want nothing when the actor assigns themselves", got)
	}
}

// TestPlanNotifications_PayloadCarriesTheDeepLink pins FR-6.3: the payload
// is what the notification list and the OS toast render from, and it
// resolves nothing for itself — every id and every name it needs is in
// here. The rules build it, so the rules are where it is stated.
func TestPlanNotifications_PayloadCarriesTheDeepLink(t *testing.T) {
	const zelt, comment = "ti-zelt", "c-1"
	resolve := resolverFor(map[string]itemFacts{zelt: {Name: "Zelt", PackerUserID: "u-sarah"}})

	t.Run("delegation", func(t *testing.T) {
		plan := planNotifications("trip-1", "u-actor",
			[]syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			allApplied(1), notificationRuleMembers, resolve, noTravelerLinks, noTodoBodies, noThreads)
		if len(plan) != 1 {
			t.Fatalf("plan = %v, want one delegation", recipients(plan))
		}
		wantPayload(t, plan[0].Payload, map[string]any{
			payloadTripID: "trip-1", payloadItemID: zelt, payloadItemName: "Zelt",
			payloadActorID: "u-actor", payloadActorName: "Andy",
		})
	})

	t.Run("task on a commented item", func(t *testing.T) {
		plan := planNotifications("trip-1", "u-actor",
			[]syncpkg.Mutation{commentMutation(comment, map[string]any{
				"body": "seal the seams", "trip_item_id": zelt, "is_task": true,
			})},
			allApplied(1), notificationRuleMembers, resolve, noTravelerLinks, noTodoBodies, noThreads)
		if len(plan) != 1 {
			t.Fatalf("plan = %v, want one task", recipients(plan))
		}
		wantPayload(t, plan[0].Payload, map[string]any{
			payloadTripID: "trip-1", payloadCommentID: comment,
			payloadItemID: zelt, payloadItemName: "Zelt",
			payloadActorID: "u-actor", payloadActorName: "Andy",
			payloadPreview: "seal the seams",
		})
	})

	t.Run("a note (no item) carries no item keys", func(t *testing.T) {
		// FR-7.9: two members only, so the broadcast lands on exactly one —
		// three would make this a plan-shape test rather than a payload one.
		twoMembers := notificationRuleMembers[:2]
		plan := planNotifications("trip-1", "u-actor",
			[]syncpkg.Mutation{commentMutation(comment, map[string]any{"body": "Schlüsselfach: 4711"})},
			allApplied(1), twoMembers, resolve, noTravelerLinks, noTodoBodies, noThreads)
		if len(plan) != 1 {
			t.Fatalf("plan = %v, want one note", recipients(plan))
		}
		wantPayload(t, plan[0].Payload, map[string]any{
			payloadTripID: "trip-1", payloadCommentID: comment,
			payloadActorID: "u-actor", payloadActorName: "Andy",
			payloadPreview: "Schlüsselfach: 4711",
		})
	})

	t.Run("an actor who has left the trip is unnamed, not missing", func(t *testing.T) {
		plan := planNotifications("trip-1", "u-ghost",
			[]syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			allApplied(1), notificationRuleMembers, resolve, noTravelerLinks, noTodoBodies, noThreads)
		if len(plan) != 1 {
			t.Fatalf("plan = %v, want one delegation", recipients(plan))
		}
		if got, ok := plan[0].Payload[payloadActorName]; !ok || got != "" {
			t.Errorf("actor_name = %v (present %v), want an empty string", got, ok)
		}
	})
}

// wantPayload asserts the payload is exactly want — extra keys included,
// because a key the client does not expect is as much of a contract change
// as a missing one.
func wantPayload(t *testing.T, got, want map[string]any) {
	t.Helper()
	for k, v := range want {
		if got[k] != v {
			t.Errorf("payload[%q] = %v, want %v", k, got[k], v)
		}
	}
	for k := range got {
		if _, ok := want[k]; !ok {
			t.Errorf("payload carries an unexpected key %q = %v", k, got[k])
		}
	}
}

// TestPlanNotifications_PreviewIsTruncated pins the teaser length: the
// payload rides an OS notification, the deep link carries the rest.
func TestPlanNotifications_PreviewIsTruncated(t *testing.T) {
	body := strings.Repeat("ä", previewLen+10)
	// FR-7.9: two members only — this is a note now (no trip_item_id), and
	// the broadcast would otherwise land one payload per other member.
	plan := planNotifications("trip-1", "u-actor",
		[]syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": body})},
		allApplied(1), notificationRuleMembers[:2], resolverFor(nil), noTravelerLinks, noTodoBodies, noThreads)
	if len(plan) != 1 {
		t.Fatalf("plan = %v, want one note", recipients(plan))
	}
	preview, _ := plan[0].Payload[payloadPreview].(string)
	// Runes, not bytes: a two-byte character must not be cut in half.
	if got := len([]rune(preview)); got != previewLen {
		t.Errorf("preview = %d runes, want %d", got, previewLen)
	}
	if !strings.HasPrefix(body, preview) {
		t.Errorf("preview %q is not the head of the body", preview)
	}
}

// TestPlanTodoAssignment_FR75 pins who a trip todo's assignment notifies:
// the assignee, as a delegation naming the task — never the actor, never
// somebody off the trip, and never twice for one mutation.
func TestPlanTodoAssignment_FR75(t *testing.T) {
	const todo = "c-todo"
	update := func(fields map[string]any) syncpkg.Mutation {
		return syncpkg.Mutation{Op: syncpkg.OpUpsert, Table: store.TableComments, ID: todo, Fields: fields}
	}
	bodies := todoBodiesFor(map[string]string{todo: "Pflanzen giessen"})

	tests := []struct {
		name   string
		mut    syncpkg.Mutation
		bodies todoResolver
		want   []string
	}{
		{
			name:   "assigning an existing todo notifies the assignee",
			mut:    update(map[string]any{"assignee_user_id": "u-sarah"}),
			bodies: bodies,
			want:   []string{"u-sarah/" + store.NotifyDelegation},
		},
		{
			name: "a todo written already assigned notifies the assignee",
			mut: commentMutation(todo, map[string]any{
				"body": "Pflanzen giessen", "is_task": 1, "task_state": "open", "assignee_user_id": "u-sarah",
			}),
			bodies: noTodoBodies,
			want:   []string{"u-sarah/" + store.NotifyDelegation},
		},
		{
			name: "an assignee who is also mentioned is notified once",
			mut: commentMutation(todo, map[string]any{
				"body": "@Sarah Pflanzen giessen", "is_task": 1, "task_state": "open", "assignee_user_id": "u-sarah",
			}),
			bodies: noTodoBodies,
			want:   []string{"u-sarah/" + store.NotifyDelegation},
		},
		{
			name:   "taking it on oneself notifies nobody",
			mut:    update(map[string]any{"assignee_user_id": "u-actor"}),
			bodies: bodies,
			want:   nil,
		},
		{
			name:   "unassigning notifies nobody",
			mut:    update(map[string]any{"assignee_user_id": nil}),
			bodies: bodies,
			want:   nil,
		},
		{
			name:   "somebody off the trip is not notified",
			mut:    update(map[string]any{"assignee_user_id": "u-stranger"}),
			bodies: bodies,
			want:   nil,
		},
		{
			name:   "an unreadable todo earns nothing rather than a nameless push",
			mut:    update(map[string]any{"assignee_user_id": "u-sarah"}),
			bodies: noTodoBodies,
			want:   nil,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := recipients(planNotifications("trip-1", "u-actor", []syncpkg.Mutation{tc.mut},
				allApplied(1), notificationRuleMembers, resolverFor(nil), noTravelerLinks, tc.bodies, noThreads))
			if strings.Join(got, ",") != strings.Join(tc.want, ",") {
				t.Fatalf("plan = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestPlanTodoAssignment_PayloadNamesTheTask pins the deep link: the trip
// and the comment, with the task's words where a row's name would stand, and
// no item keys — a trip todo has no row, so the link opens the trip.
func TestPlanTodoAssignment_PayloadNamesTheTask(t *testing.T) {
	plan := planNotifications("trip-1", "u-actor",
		[]syncpkg.Mutation{{Op: syncpkg.OpUpsert, Table: store.TableComments, ID: "c-todo",
			Fields: map[string]any{"assignee_user_id": "u-sarah"}}},
		allApplied(1), notificationRuleMembers, resolverFor(nil), noTravelerLinks,
		todoBodiesFor(map[string]string{"c-todo": "Pflanzen giessen"}), noThreads)
	if len(plan) != 1 {
		t.Fatalf("plan = %v, want one delegation", recipients(plan))
	}
	wantPayload(t, plan[0].Payload, map[string]any{
		payloadTripID: "trip-1", payloadCommentID: "c-todo", payloadItemName: "Pflanzen giessen",
		payloadActorID: "u-actor", payloadActorName: "Andy",
	})
}

// FR-7.13: a reply tells the thread's participants — the first note's
// author and everyone who has replied — and nobody else on the trip.
func TestPlanNotifications_NoteReply_ReachesTheParticipantsOnly_FR7_13(t *testing.T) {
	const root = "note-root"
	members := append([]store.MemberName{{UserID: "u-chris", DisplayName: "Chris"}}, notificationRuleMembers...)
	reply := func(body string) syncpkg.Mutation {
		return commentMutation("c-reply", map[string]any{"body": body, "parent_id": root})
	}
	tests := []struct {
		name    string
		threads map[string]noteThreadFacts
		want    []string
	}{
		{
			name: "the first note's author and an earlier replier are told, a bystander is not",
			threads: map[string]noteThreadFacts{root: {
				Title: "Schlüsselbox", Participants: []string{"u-sarah", "u-max"},
			}},
			want: []string{"u-sarah/" + store.NotifyNoteReply, "u-max/" + store.NotifyNoteReply},
		},
		{
			name: "the replier is never told of their own reply",
			threads: map[string]noteThreadFacts{root: {
				Participants: []string{"u-actor", "u-sarah", "u-actor"},
			}},
			want: []string{"u-sarah/" + store.NotifyNoteReply},
		},
		{
			name: "a participant who has left the trip is not told",
			threads: map[string]noteThreadFacts{root: {
				Participants: []string{"u-gone", "u-sarah"},
			}},
			want: []string{"u-sarah/" + store.NotifyNoteReply},
		},
		{
			name:    "a thread that cannot be read costs its notification and nothing else",
			threads: map[string]noteThreadFacts{},
			want:    nil,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := recipients(planNotifications("trip-1", "u-actor", []syncpkg.Mutation{reply("Danke!")},
				allApplied(1), members, resolverFor(nil), noTravelerLinks, noTodoBodies, threadsFor(tc.threads)))
			if strings.Join(got, ",") != strings.Join(tc.want, ",") {
				t.Fatalf("plan = %v, want %v", got, tc.want)
			}
		})
	}

	t.Run("the payload names the thread and opens it", func(t *testing.T) {
		threads := threadsFor(map[string]noteThreadFacts{root: {
			Body: "Code 4711\nhinter dem Haus", Participants: []string{"u-sarah"},
		}})
		plan := planNotifications("trip-1", "u-actor", []syncpkg.Mutation{reply("Danke!")},
			allApplied(1), members, resolverFor(nil), noTravelerLinks, noTodoBodies, threads)
		if len(plan) != 1 {
			t.Fatalf("plan = %v, want one reply", recipients(plan))
		}
		// Untitled, so the thread is named by its first line (FR-7.13).
		wantPayload(t, plan[0].Payload, map[string]any{
			payloadTripID: "trip-1", payloadCommentID: "c-reply", payloadThreadID: root,
			payloadActorID: "u-actor", payloadActorName: "Andy",
			payloadPreview: "Danke!", payloadThread: "Code 4711",
		})
	})

	t.Run("an edit notifies nobody", func(t *testing.T) {
		edit := syncpkg.Mutation{Op: syncpkg.OpUpsert, Table: store.TableComments, ID: "c-reply",
			Fields: map[string]any{"body": "Danke!!", "edited_at": "2026-09-25T10:00:00Z"}}
		plan := planNotifications("trip-1", "u-actor", []syncpkg.Mutation{edit},
			allApplied(1), members, resolverFor(nil), noTravelerLinks, noTodoBodies,
			threadsFor(map[string]noteThreadFacts{root: {Participants: []string{"u-sarah"}}}))
		if len(plan) != 0 {
			t.Fatalf("plan = %v, want none", recipients(plan))
		}
	})
}
