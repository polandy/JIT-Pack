// The notification half of the contract (FR-6.2, NFR-4.6): what an in-app
// notification and a Web Push carry, kept apart from wire.go for its size.
// cmd/wiregen reads it together with wire.go; see that file's header.

package api

// --- Notifications (FR-6.2) ---

// NotificationEntry is one notification. It is not named Notification because
// that is a DOM global on the client, and a generated type shadowing it would
// be a trap rather than a contract.
type NotificationEntry struct {
	ID   string           `json:"id"`
	Kind NotificationKind `json:"kind"`
	// The teaser the toast and the OS notification render; the deep link
	// carries the rest. Null where the stored payload was empty.
	Payload   map[string]any `json:"payload"`
	CreatedAt string         `json:"created_at"`
	// Absent while unread.
	ReadAt *string `json:"read_at,omitempty"`
}

// NotificationKind is what a notification is about (FR-6.2, UI-Spec M17).
type NotificationKind string

// The kinds, each FR's meaning beside store.Notify*, whose spelling
// TestWireNotificationKinds_MirrorStore holds these to.
const (
	NotificationKindDelegation      NotificationKind = "delegation"
	NotificationKindMention         NotificationKind = "mention"
	NotificationKindTask            NotificationKind = "task"
	NotificationKindLockTaken       NotificationKind = "lock_taken"
	NotificationKindNote            NotificationKind = "note"
	NotificationKindNoteReply       NotificationKind = "note_reply"
	NotificationKindTaskDue         NotificationKind = "task_due"
	NotificationKindShoppingDue     NotificationKind = "shopping_due"
	NotificationKindExcursionDue    NotificationKind = "excursion_due"
	NotificationKindIdea            NotificationKind = "idea"
	NotificationKindIdeaComment     NotificationKind = "idea_comment"
	NotificationKindIdeaShortlisted NotificationKind = "idea_shortlisted"
)

// NotificationPayloadKey is a key of NotificationEntry.Payload. The payload
// stays a map because each kind fills a different subset; the keys are
// internal/notify's, held equal by TestWireNotificationPayload_MirrorNotify.
type NotificationPayloadKey string

// Every key a payload may carry (FR-6.3's deep link and the teaser).
const (
	NotificationKeyTripID      NotificationPayloadKey = "trip_id"
	NotificationKeyItemID      NotificationPayloadKey = "item_id"
	NotificationKeyItemName    NotificationPayloadKey = "item_name"
	NotificationKeyActorID     NotificationPayloadKey = "actor_id"
	NotificationKeyActorName   NotificationPayloadKey = "actor_name"
	NotificationKeyCommentID   NotificationPayloadKey = "comment_id"
	NotificationKeyPreview     NotificationPayloadKey = "preview"
	NotificationKeyThreadID    NotificationPayloadKey = "thread_id"
	NotificationKeyThread      NotificationPayloadKey = "thread"
	NotificationKeyIdeaID      NotificationPayloadKey = "idea_id"
	NotificationKeyDue         NotificationPayloadKey = "due"
	NotificationKeyEntryID     NotificationPayloadKey = "entry_id"
	NotificationKeyExcursionID NotificationPayloadKey = "excursion_id"
	// NotificationKeyTime is a timed task's HH:MM (FR-7.18).
	NotificationKeyTime NotificationPayloadKey = "time"
)

// NotificationDue is a reminder's `due` value: the day it is about, as a
// word — or, for a timed task's push at its time, „now".
type NotificationDue string

// The two days a reminder is sent for (FR-7.11), and a timed task's moment
// (FR-7.18).
const (
	NotificationDueToday    NotificationDue = "today"
	NotificationDueTomorrow NotificationDue = "tomorrow"
	NotificationDueNow      NotificationDue = "now"
)

// NotificationListResponse is the list envelope, newest first.
type NotificationListResponse struct {
	Notifications []NotificationEntry `json:"notifications"`
}

// NotificationPrefs is the per-kind toggle set (UI-Spec M17). The server
// answers all three keys always — a kind the stored value omits comes back
// enabled — so none of them is optional on the wire.
type NotificationPrefs struct {
	Delegation bool `json:"delegation"`
	Mention    bool `json:"mention"`
	Task       bool `json:"task"`
	// FR-5.7: somebody took over a row this user had claimed.
	LockTaken bool `json:"lock_taken"`
	// FR-7.9: a co-traveller wrote a new trip note.
	Note bool `json:"note"`
	// FR-7.13: somebody else replied in a thread this user took part in.
	NoteReply bool `json:"note_reply"`
	// FR-7.11: a task this user is to do is due tomorrow or today.
	TaskDue bool `json:"task_due"`
	// FR-30.10: a shopping entry of one of this user's trips is due
	// tomorrow or today.
	ShoppingDue bool `json:"shopping_due"`
	// FR-31.9: an excursion of one of this user's trips starts tomorrow or
	// today and still has things to pack.
	ExcursionDue bool `json:"excursion_due"`
	// FR-29.8: a co-traveller put up a new idea.
	Idea bool `json:"idea"`
	// FR-29.8: somebody else wrote about an idea this user wrote or wrote
	// about.
	IdeaComment bool `json:"idea_comment"`
	// FR-29.8: a co-traveller moved an idea to the shortlist.
	IdeaShortlisted bool `json:"idea_shortlisted"`
}

// --- Web Push (NFR-4.6) ---

// VAPIDKeyResponse carries the instance's public VAPID key, generated on
// first use and persisted beside the database.
type VAPIDKeyResponse struct {
	Key string `json:"key"`
}

// WebPushMessage is the encrypted body of one push, read by client/public/sw.js
// (held to these names by notifications/__tests__/workerWire.spec.ts).
// internal/notify marshals it from its own pushMessage, which cannot import
// this package; TestWireWebPushMessage_MirrorNotify holds the two equal.
type WebPushMessage struct {
	NotificationID string           `json:"notification_id"`
	Kind           NotificationKind `json:"kind"`
	Payload        map[string]any   `json:"payload"`
}
