// Package api — notificationrules.go holds FR-6.2/FR-7.2 as a decision,
// apart from the I/O that carries it out. Who a push notifies is a rule
// over the mutations, their outcomes and the trip's members; creating the
// rows, pinging the sockets and sending Web Push is not. Keeping the two
// in one method made every rule reachable only through HTTP plus SQLite
// plus a goroutine, which is the cut CODING_PRINCIPLES §3 rules out.
package api

import (
	"strings"
	"unicode"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

// plannedNotification is one notification the rules decided is owed:
// its recipient, its kind and the FR-6.3 deep-link payload. Nothing here
// has been persisted or delivered yet.
type plannedNotification struct {
	UserID  string
	Kind    string
	Payload map[string]any
}

// itemFacts is everything the rules need to know about a trip item: the
// name a notification says out loud, and the packer FR-7.2 addresses.
type itemFacts struct {
	Name         string
	PackerUserID string
}

// itemResolver answers what the rules need about a trip item, reporting
// false when it cannot be read. It is the rules' only I/O and enters as a
// seam so the decisions below can be stated in a table; the caller owns
// the store call and the logging behind it.
type itemResolver func(itemID string) (itemFacts, bool)

// planNotifications turns one push's mutations into the notifications they
// earn, in the order they should be delivered. It reads nothing and writes
// nothing: every input is a parameter.
//
// A mutation the push did not apply earns nothing, and neither does a trip
// with fewer than two people on it — FR-17.3, which is also why Single-User
// Mode never produces a notification without the handler having to know it.
func planNotifications(
	tripID, actor string,
	muts []syncpkg.Mutation,
	results []MutationResult,
	members []store.MemberName,
	resolve itemResolver,
) []plannedNotification {
	if len(members) < 2 {
		return nil
	}
	actorName := displayNameOf(members, actor)

	var plan []plannedNotification
	for i, m := range muts {
		// Results are positional: the push answers one per mutation, in
		// order. A short vector means the mutation was never judged.
		if i >= len(results) || (results[i].Outcome != OutcomeApplied && results[i].Outcome != OutcomeMerged) {
			continue
		}
		switch m.Table {
		case store.TableTripItems:
			plan = append(plan, planDelegation(tripID, actor, actorName, m, resolve)...)
		case store.TableComments:
			if m.Op == syncpkg.OpInsert {
				plan = append(plan, planComment(tripID, actor, actorName, m, members, resolve)...)
			}
		}
	}
	return plan
}

// planDelegation fires when a push hands packing responsibility to someone
// else (FR-4.3 → FR-6.2). Since FR-25.19 packer_user_id *is* that
// responsibility and nothing else — packing a row writes the separate
// record column instead — so this reads a deliberate assignment rather
// than having to tell the two apart.
func planDelegation(tripID, actor, actorName string, m syncpkg.Mutation, resolve itemResolver) []plannedNotification {
	target, _ := m.Fields["packer_user_id"].(string)
	if target == "" || target == actor {
		return nil
	}
	facts, ok := resolve(m.ID)
	if !ok {
		return nil
	}
	return []plannedNotification{{
		UserID: target,
		Kind:   store.NotifyDelegation,
		Payload: map[string]any{
			payloadTripID: tripID, payloadItemID: m.ID,
			payloadActorID: actor, payloadActorName: actorName, payloadItemName: facts.Name,
		},
	}}
}

// planComment fires mention notifications for @display-name matches and a
// task notification to the item's packer when the comment is a task
// (FR-7.2). A packer who is also mentioned gets exactly one notification —
// task wins, it is the more actionable kind.
func planComment(
	tripID, actor, actorName string,
	m syncpkg.Mutation,
	members []store.MemberName,
	resolve itemResolver,
) []plannedNotification {
	body, _ := m.Fields["body"].(string)
	payload := map[string]any{
		payloadTripID: tripID, payloadCommentID: m.ID,
		payloadActorID: actor, payloadActorName: actorName, payloadPreview: truncate(body, previewLen),
	}

	var plan []plannedNotification
	notified := map[string]bool{}

	if itemID, _ := m.Fields["trip_item_id"].(string); itemID != "" {
		facts, ok := resolve(itemID)
		if !ok {
			// An unreadable item costs the comment its mentions too: the
			// payload they would carry is the one that failed to resolve,
			// and half of a deep link is worse than none.
			return nil
		}
		payload[payloadItemID] = itemID
		payload[payloadItemName] = facts.Name
		if syncpkg.IsTruthy(m.Fields["is_task"]) && facts.PackerUserID != "" && facts.PackerUserID != actor {
			plan = append(plan, plannedNotification{UserID: facts.PackerUserID, Kind: store.NotifyTask, Payload: payload})
			notified[facts.PackerUserID] = true
		}
	}

	for _, target := range mentionTargets(body, members) {
		if target == actor || notified[target] {
			continue
		}
		plan = append(plan, plannedNotification{UserID: target, Kind: store.NotifyMention, Payload: payload})
		notified[target] = true
	}
	return plan
}

// displayNameOf resolves one member's display name. An id that is not on
// the trip yields the empty string, which the client renders as an
// unnamed actor rather than as nothing at all.
func displayNameOf(members []store.MemberName, userID string) string {
	for _, m := range members {
		if m.UserID == userID {
			return m.DisplayName
		}
	}
	return ""
}

// mentionTargets returns the user ids of members whose display name
// appears as @<name> in body. Matching is case-insensitive and
// tolerates spaces inside names (OIDC display names); the character
// after the name must be a word boundary so @Andyx never hits @Andy.
func mentionTargets(body string, members []store.MemberName) []string {
	lower := strings.ToLower(body)
	var out []string
	for _, m := range members {
		name := strings.ToLower(m.DisplayName)
		if name == "" {
			continue
		}
		for idx := 0; ; {
			i := strings.Index(lower[idx:], "@"+name)
			if i < 0 {
				break
			}
			end := idx + i + 1 + len(name)
			if end >= len(lower) || !isNameRune(rune(lower[end])) {
				out = append(out, m.UserID)
				break
			}
			idx = end
		}
	}
	return out
}

func isNameRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}

func truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}
