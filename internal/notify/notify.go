// Package notify is the notification sub-domain (FR-6.2, FR-7.11, NFR-4.6):
// who a push, a lock takeover or the day's reminder notifies, the rows that
// carry it, and their delivery to connected devices and over Web Push. The
// rules are pure functions over what the trip says (rules.go, due.go); the
// Notifier around them is the I/O. HTTP is not here — the endpoints that
// list, acknowledge and subscribe stay in internal/api, which holds one
// Notifier. See ADR-099.
package notify

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

// Pinger tells a user's connected devices that a notification exists
// (spec §7, notification.created). The WebSocket hub is the one in
// production.
type Pinger interface {
	NotifyNotificationCreated(userID, notificationID string)
}

// Options configures a Notifier. The zero value is a working one.
type Options struct {
	// Contact is the RFC 8292 subscriber shown to push services; empty
	// means defaultPushContact.
	Contact string
	// Now is the clock the daily reminder reads (G-4); nil means time.Now.
	Now func() time.Time
}

// Notifier creates notifications and delivers them. It owns the Web Push
// state — the VAPID keypair and the deliveries still in flight.
type Notifier struct {
	store   *store.Store
	ping    Pinger
	push    pushSender
	now     func() time.Time
	contact string

	vapidMu   sync.Mutex
	vapidPub  string
	vapidPriv string

	// detached counts the Web Push deliveries a notification started and
	// nobody waits for. See Wait for what it is counted for.
	detached sync.WaitGroup
}

// New builds the Notifier the server runs with.
func New(st *store.Store, ping Pinger, opts Options) *Notifier {
	n := &Notifier{
		store: st, ping: ping, push: webPush{timeout: pushSendTimeout},
		now: opts.Now, contact: opts.Contact,
	}
	if n.now == nil {
		n.now = time.Now
	}
	if n.contact == "" {
		n.contact = defaultPushContact
	}
	return n
}

// Contact is the RFC 8292 subscriber this Notifier signs its VAPID claims
// with.
func (n *Notifier) Contact() string { return n.contact }

// Wait blocks until the Web Push deliveries already started have finished,
// or until ctx is done — in which case it returns ctx.Err() and that work is
// abandoned mid-flight.
//
// It exists because a detached delivery is not a fire-and-forget in the
// only moment that matters: process shutdown. A notification created a
// millisecond before SIGTERM has already answered its push and pinged
// the WebSocket, and its Web Push send is the one part still in the air
// — exiting under it drops the notification for exactly the clients it
// was invented for, the backgrounded and the closed ones (NFR-4.6).
//
// Call it only once nothing creates notifications any more: it makes no
// promise about a delivery started while it waits.
func (n *Notifier) Wait(ctx context.Context) error {
	done := make(chan struct{})
	go func() {
		n.detached.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Pushed creates and fans out the notifications one push earns. landed are
// the push's mutations that changed the trip — a refused one earns nothing,
// and telling the two apart is the caller's, which holds the verdicts. The
// decision of who gets what is planNotifications'; everything here is the
// I/O that carries it out. Failures are logged, never surfaced —
// notifications are a side effect, the push already succeeded.
func (n *Notifier) Pushed(ctx context.Context, tripID, actor string, landed []syncpkg.Mutation) {
	members, err := n.store.TripMemberNames(ctx, tripID)
	if err != nil {
		slog.Error("notification member lookup", "trip", tripID, "error", err)
		return
	}
	plan := planNotifications(tripID, actor, landed, members, storeFacts{ctx: ctx, st: n.store})
	n.deliver(ctx, plan)
}

// LockTaken tells the person a row was taken from (FR-6.2). It is the
// whole difference between a lock that can be broken and one that is not a
// lock: breaking it costs saying that you meant to.
func (n *Notifier) LockTaken(ctx context.Context, ev store.LockEvent) {
	// The name, not only the id: "Sarah took Zelt over" is the message,
	// and the notification list resolves nothing for itself.
	members, err := n.store.TripMemberNames(ctx, ev.TripID)
	if err != nil {
		slog.Error("takeover member lookup", "trip", ev.TripID, "error", err)
	}
	n.deliver(ctx, []plannedNotification{{
		UserID: ev.FromUserID,
		Kind:   store.NotifyLockTaken,
		Payload: map[string]any{
			payloadTripID:    ev.TripID,
			payloadItemID:    ev.TripItemID,
			payloadItemName:  ev.ItemName,
			payloadActorID:   ev.ToUserID,
			payloadActorName: displayNameOf(members, ev.ToUserID),
		},
	}})
}

// deliver persists each planned notification (unless the target's prefs
// suppress it) and pings the target's connected devices.
func (n *Notifier) deliver(ctx context.Context, plan []plannedNotification) {
	for _, p := range plan {
		id, err := n.store.CreateNotification(ctx, p.UserID, p.Kind, p.Payload)
		if err != nil {
			slog.Error("create notification", "user", p.UserID, "kind", p.Kind, "error", err)
			continue
		}
		if id == "" {
			continue // preference-suppressed (M17)
		}
		n.ping.NotifyNotificationCreated(p.UserID, id)
		// Web Push rides along detached (NFR-4.6): the response and the WS
		// ping must never wait on a third-party push service. Detached from
		// the request, not from the process — see Wait.
		n.detached.Add(1)
		go func() {
			defer n.detached.Done()
			n.sendWebPush(p.UserID, id, p.Kind, p.Payload)
		}()
	}
}

// storeFacts answers the rules' questions from the store, logging what it
// cannot read — the rules only see that an answer is missing.
type storeFacts struct {
	ctx context.Context
	st  *store.Store
}

func (f storeFacts) item(itemID string) (itemFacts, bool) {
	name, packer, err := f.st.TripItemInfo(f.ctx, itemID)
	if err != nil {
		slog.Error("notification item lookup", "item", itemID, "error", err)
		return itemFacts{}, false
	}
	return itemFacts{Name: name, PackerUserID: packer}, true
}

func (f storeFacts) travelerAccount(travelerID string) (string, bool) {
	linkedUserID, ok, err := f.st.TravelerLinkedUser(f.ctx, travelerID)
	if err != nil {
		slog.Error("notification traveler lookup", "traveler", travelerID, "error", err)
		return "", false
	}
	return linkedUserID, ok
}

func (f storeFacts) words(table, id string) (string, bool) {
	lookup := f.st.CommentBody
	if table == store.TableShoppingEntries {
		lookup = f.st.ShoppingEntryName
	}
	words, err := lookup(f.ctx, id)
	if err != nil {
		slog.Error("notification assignment lookup", "table", table, "id", id, "error", err)
		return "", false
	}
	return words, true
}

func (f storeFacts) thread(rootID string) (noteThreadFacts, bool) {
	thread, err := f.st.NoteThread(f.ctx, rootID)
	if err != nil {
		slog.Error("notification thread lookup", "comment", rootID, "error", err)
		return noteThreadFacts{}, false
	}
	return noteThreadFacts{Title: thread.Title, Body: thread.Body, Participants: thread.Participants}, true
}

func (f storeFacts) idea(ideaID string) (ideaFacts, bool) {
	idea, err := f.st.IdeaDiscussion(f.ctx, ideaID)
	if err != nil {
		slog.Error("notification idea lookup", "idea", ideaID, "error", err)
		return ideaFacts{}, false
	}
	return ideaFacts{Title: idea.Title, Participants: idea.Participants}, true
}

// Payload keys shared by every notification kind (FR-6.3 deep link).
const (
	payloadTripID    = "trip_id"
	payloadItemID    = "item_id"
	payloadItemName  = "item_name"
	payloadActorID   = "actor_id"
	payloadActorName = "actor_name"
	payloadCommentID = "comment_id"
	payloadPreview   = "preview"
	// FR-7.13: a reply names its thread — the first note's id, so the tap
	// opens it, and what it is called, so the sentence can say.
	payloadThreadID = "thread_id"
	payloadThread   = "thread"
	// FR-29.8: an idea's notification opens the idea (M28's `?idea=`); its
	// title rides in payloadItemName, the slot every client already fills.
	payloadIdeaID = "idea_id"
)

// previewLen truncates comment bodies in payloads — the payload is a teaser
// for the toast/OS notification, the deep link has the rest.
const previewLen = 120
