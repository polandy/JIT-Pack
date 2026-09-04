package api

import (
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
