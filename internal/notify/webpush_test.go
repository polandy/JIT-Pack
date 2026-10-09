package notify

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"jitpack/internal/store"
)

// NFR-4.6: what the Notifier does with a push service's answer, decided
// against a fake sender — no network, no goroutine, no wait. The real
// signing and encryption are held end to end by internal/api's push_test.go.

// nopPinger is a hub with no device connected.
type nopPinger struct{}

func (nopPinger) NotifyNotificationCreated(string, string) {}

// fakeSender answers every delivery with status and records what it was
// handed.
type fakeSender struct {
	status int
	sent   []store.PushSubscription
	keys   []vapid
}

func (f *fakeSender) send(_ context.Context, _ []byte, sub store.PushSubscription, keys vapid) (int, error) {
	f.sent = append(f.sent, sub)
	f.keys = append(f.keys, keys)
	return f.status, nil
}

// notifierWithSubscription is a Notifier over a fresh store holding one
// browser subscription for u-1, delivering through sender.
func notifierWithSubscription(t *testing.T, sender pushSender, opts Options) (*Notifier, *store.Store) {
	t.Helper()
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	if _, err := st.DB().Exec(`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u-1', 'sub-1', 'Andy')`); err != nil {
		t.Fatal(err)
	}
	if err := st.SavePushSubscription(context.Background(), store.PushSubscription{
		UserID: "u-1", Endpoint: "https://push.example/sub-1", P256dh: "p256dh", Auth: "auth",
	}); err != nil {
		t.Fatal(err)
	}
	n := New(st, nopPinger{}, opts)
	n.push = sender
	return n, st
}

func TestSendWebPush_NFR4_6_WhatThePushServiceAnswersDecidesTheSubscription(t *testing.T) {
	for _, tc := range []struct {
		name     string
		status   int
		wantKept bool
	}{
		{"delivered: kept", http.StatusCreated, true},
		{"gone: the browser dropped it", http.StatusGone, false},
		{"not found: the browser dropped it", http.StatusNotFound, false},
		{"a server error is the push service's, not the subscription's", http.StatusInternalServerError, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sender := &fakeSender{status: tc.status}
			n, st := notifierWithSubscription(t, sender, Options{})
			n.sendWebPush("u-1", "n-1", store.NotifyDelegation, map[string]any{payloadTripID: "trip-1"})

			if len(sender.sent) != 1 || sender.sent[0].Endpoint != "https://push.example/sub-1" {
				t.Fatalf("sent = %+v, want the one subscription", sender.sent)
			}
			subs, err := st.PushSubscriptions(context.Background(), "u-1")
			if err != nil {
				t.Fatal(err)
			}
			if kept := len(subs) == 1; kept != tc.wantKept {
				t.Errorf("subscription kept = %v, want %v", kept, tc.wantKept)
			}
		})
	}
}

func TestSendWebPush_NFR4_6_SignsWithTheOperatorsContactAndOneKeypair(t *testing.T) {
	for _, tc := range []struct {
		name    string
		contact string
		want    string
	}{
		{"the operator's contact", "mailto:ops@example.com", "mailto:ops@example.com"},
		{"none configured", "", defaultPushContact},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sender := &fakeSender{status: http.StatusCreated}
			n, _ := notifierWithSubscription(t, sender, Options{Contact: tc.contact})
			n.sendWebPush("u-1", "n-1", store.NotifyDelegation, nil)
			n.sendWebPush("u-1", "n-2", store.NotifyDelegation, nil)

			if len(sender.keys) != 2 {
				t.Fatalf("deliveries = %d, want 2", len(sender.keys))
			}
			if got := sender.keys[0].subscriber; got != tc.want {
				t.Errorf("subscriber = %q, want %q", got, tc.want)
			}
			pub, err := n.VAPIDPublicKey(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			for _, k := range sender.keys {
				if k.public != pub || k.private == "" {
					t.Errorf("keys = %+v, want the served public key %q and its private half", k, pub)
				}
			}
		})
	}
}

// A push service that never answers costs its delivery, not a goroutine for
// the life of the process: the send gives up at its timeout. The service
// holds every request until the client goes away, so the only way out is
// the deadline.
func TestWebPush_NFR4_6_GivesUpOnAPushServiceThatNeverAnswers(t *testing.T) {
	silent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(silent.Close)

	n, _ := notifierWithSubscription(t, nil, Options{})
	pub, priv, err := n.vapidKeys(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	sub := store.PushSubscription{
		Endpoint: silent.URL,
		P256dh:   "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
		Auth:     "tBHItJI5svbpez7KI4CCXg",
	}
	_, err = webPush{timeout: 1}.send(context.Background(), []byte("{}"), sub,
		vapid{public: pub, private: priv, subscriber: defaultPushContact})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("send = %v, want context.DeadlineExceeded", err)
	}
}
