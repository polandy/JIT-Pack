package notify

// Web Push delivery (NFR-4.6): self-generated VAPID keys persisted in the
// store, and RFC 8291-encrypted sends when a notification is created.
// In-app delivery over the WebSocket remains the universal fallback; push
// only extends reach to backgrounded and closed clients.

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"jitpack/internal/store"
)

const (
	vapidPublicKey  = "vapid_public"
	vapidPrivateKey = "vapid_private"
	// defaultPushContact satisfies the VAPID sub claim (RFC 8292) when
	// the operator sets no JITPACK_PUSH_CONTACT.
	defaultPushContact = "mailto:admin@localhost"
	pushTTLSeconds     = 3600
	// pushSendTimeout bounds one delivery: a push service that never
	// answers costs its own subscription, never a goroutine for the life
	// of the process. Below the 5 s shutdown budget would cut deliveries
	// a slow service still answers; that budget abandons them anyway.
	pushSendTimeout = 10 * time.Second
)

// vapid is what signs a delivery: the server's keypair and the RFC 8292
// subscriber it names.
type vapid struct {
	public, private, subscriber string
}

// pushSender delivers one encrypted message to one browser subscription
// and answers the push service's HTTP status.
type pushSender interface {
	send(ctx context.Context, message []byte, sub store.PushSubscription, keys vapid) (status int, err error)
}

// webPush is the pushSender of production: RFC 8291 encryption and VAPID
// signing by webpush-go, each delivery bounded by timeout.
type webPush struct {
	timeout time.Duration
}

func (w webPush) send(ctx context.Context, message []byte, sub store.PushSubscription, keys vapid) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, w.timeout)
	defer cancel()
	resp, err := webpush.SendNotificationWithContext(ctx, message, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		Subscriber: keys.subscriber, VAPIDPublicKey: keys.public, VAPIDPrivateKey: keys.private, TTL: pushTTLSeconds,
	})
	if err != nil {
		return 0, err
	}
	resp.Body.Close()
	return resp.StatusCode, nil
}

// VAPIDPublicKey is the key a browser needs as applicationServerKey for
// pushManager.subscribe.
func (n *Notifier) VAPIDPublicKey(ctx context.Context) (string, error) {
	pub, _, err := n.vapidKeys(ctx)
	return pub, err
}

// vapidKeys returns the server's VAPID keypair, generating and
// persisting it on first use. SetServerKey is first-writer-wins, so
// racing instances converge on one keypair — the values are re-read
// after writing.
func (n *Notifier) vapidKeys(ctx context.Context) (pub, priv string, err error) {
	n.vapidMu.Lock()
	defer n.vapidMu.Unlock()
	if n.vapidPub != "" {
		return n.vapidPub, n.vapidPriv, nil
	}

	pub, pubOK, err := n.store.ServerKey(ctx, vapidPublicKey)
	if err != nil {
		return "", "", err
	}
	priv, privOK, err := n.store.ServerKey(ctx, vapidPrivateKey)
	if err != nil {
		return "", "", err
	}
	if !pubOK || !privOK {
		genPriv, genPub, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			return "", "", err
		}
		if err := n.store.SetServerKey(ctx, vapidPublicKey, genPub); err != nil {
			return "", "", err
		}
		if err := n.store.SetServerKey(ctx, vapidPrivateKey, genPriv); err != nil {
			return "", "", err
		}
		if pub, _, err = n.store.ServerKey(ctx, vapidPublicKey); err != nil {
			return "", "", err
		}
		if priv, _, err = n.store.ServerKey(ctx, vapidPrivateKey); err != nil {
			return "", "", err
		}
	}
	n.vapidPub, n.vapidPriv = pub, priv
	return pub, priv, nil
}

// sendWebPush delivers a created notification to all push endpoints of
// the target user. Runs detached from the request: failures only cost
// this channel, the WebSocket ping already went out. Push services
// answering 404/410 mean the browser dropped the registration — the
// subscription is deleted.
func (n *Notifier) sendWebPush(userID, notificationID, kind string, payload map[string]any) {
	ctx := context.Background()
	subs, err := n.store.PushSubscriptions(ctx, userID)
	if err != nil {
		slog.Error("push subscriptions", "user", userID, "error", err)
		return
	}
	if len(subs) == 0 {
		return
	}
	pub, priv, err := n.vapidKeys(ctx)
	if err != nil {
		slog.Error("vapid keys", "error", err)
		return
	}
	message, err := json.Marshal(map[string]any{
		"notification_id": notificationID, "kind": kind, "payload": payload,
	})
	if err != nil {
		slog.Error("marshal push message", "error", err)
		return
	}

	keys := vapid{public: pub, private: priv, subscriber: n.contact}
	for _, sub := range subs {
		status, err := n.push.send(ctx, message, sub, keys)
		if err != nil {
			slog.Debug("web push send", "endpoint", sub.Endpoint, "error", err)
			continue
		}
		if status == http.StatusNotFound || status == http.StatusGone {
			if err := n.store.DeletePushSubscription(ctx, sub.Endpoint); err != nil {
				slog.Error("drop expired subscription", "error", err)
			}
		}
	}
}
