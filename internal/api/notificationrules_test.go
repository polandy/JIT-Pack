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
			name:  "FR-6.2 a mention reaches the member it names",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Sarah bring the poles"})},
			items: zeltUnassigned,
			want:  []string{"u-sarah/" + store.NotifyMention},
		},
		{
			name:  "a mention of a name with a space still resolves",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "ping @max muster please"})},
			items: zeltUnassigned,
			want:  []string{"u-max/" + store.NotifyMention},
		},
		{
			name:  "a longer name starting with a member's name is not that member",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Sarahs Zelt"})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name:  "mentioning yourself notifies nobody",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Andy reminder"})},
			items: zeltUnassigned,
			want:  nil,
		},
		{
			name:  "the same member mentioned twice is notified once",
			muts:  []syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": "@Sarah and @Sarah again"})},
			items: zeltUnassigned,
			want:  []string{"u-sarah/" + store.NotifyMention},
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
				commentMutation("c-1", map[string]any{"body": "@Max Muster look"}),
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
			got := recipients(planNotifications("trip-1", "u-actor", tc.muts, results, members, resolverFor(tc.items)))
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
			allApplied(1), notificationRuleMembers, resolve)
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
			allApplied(1), notificationRuleMembers, resolve)
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

	t.Run("a comment on no item carries no item keys", func(t *testing.T) {
		plan := planNotifications("trip-1", "u-actor",
			[]syncpkg.Mutation{commentMutation(comment, map[string]any{"body": "@Sarah hi"})},
			allApplied(1), notificationRuleMembers, resolve)
		if len(plan) != 1 {
			t.Fatalf("plan = %v, want one mention", recipients(plan))
		}
		wantPayload(t, plan[0].Payload, map[string]any{
			payloadTripID: "trip-1", payloadCommentID: comment,
			payloadActorID: "u-actor", payloadActorName: "Andy",
			payloadPreview: "@Sarah hi",
		})
	})

	t.Run("an actor who has left the trip is unnamed, not missing", func(t *testing.T) {
		plan := planNotifications("trip-1", "u-ghost",
			[]syncpkg.Mutation{tripItemMutation(zelt, map[string]any{"packer_user_id": "u-sarah"})},
			allApplied(1), notificationRuleMembers, resolve)
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
	plan := planNotifications("trip-1", "u-actor",
		[]syncpkg.Mutation{commentMutation("c-1", map[string]any{"body": body + " @Sarah"})},
		allApplied(1), notificationRuleMembers, resolverFor(nil))
	if len(plan) != 1 {
		t.Fatalf("plan = %v, want one mention", recipients(plan))
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
