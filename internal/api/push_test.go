package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// NFR-4.6: Web Push against a fake push service — real VAPID signing and
// RFC 8291 encryption end to end, only the push-service URL is local.

// fakePushService records incoming web-push deliveries.
type fakePushService struct {
	srv      *httptest.Server
	received chan *http.Request
	status   int
}

func newFakePushService(t *testing.T, status int) *fakePushService {
	t.Helper()
	f := &fakePushService{received: make(chan *http.Request, 4), status: status}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.received <- r.Clone(context.Background())
		w.WriteHeader(f.status)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakePushService) waitForDelivery(t *testing.T) *http.Request {
	t.Helper()
	select {
	case r := <-f.received:
		return r
	case <-time.After(3 * time.Second):
		t.Fatal("no web push delivery within 3s")
		return nil
	}
}

// registerSubscription registers a browser-shaped subscription for user.
// The keys are a valid P-256 point + auth secret (needed for RFC 8291
// encryption to succeed); generated once with the webpush-go test vector
// shape: any real browser subscription works, these are throwaways.
func registerSubscription(t *testing.T, srv *httptest.Server, user, endpoint string) {
	t.Helper()
	resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/push/subscriptions",
		token(t, user, testSecret), map[string]any{
			"endpoint": endpoint,
			"keys": map[string]string{
				"p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
				"auth":   "tBHItJI5svbpez7KI4CCXg",
			},
		})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("register status = %d (body %s)", resp.StatusCode, raw)
	}
}

func TestWebPush_DeliveredOnNotification(t *testing.T) {
	srv, _ := newTestServerWithStore(t)
	push := newFakePushService(t, http.StatusCreated)
	registerSubscription(t, srv, userB, push.srv.URL+"/sub-1")
	seedItem(t, srv, "item-1", "Zelt")

	pushAs(t, srv, userA, mutation("item-1", "m-delegate", "upsert",
		map[string]any{"packer_user_id": userB}, "0000000002000-0000-aaaaaaaa"))

	r := push.waitForDelivery(t)
	if auth := r.Header.Get("Authorization"); auth == "" {
		t.Error("delivery missing VAPID Authorization header")
	}
	if enc := r.Header.Get("Content-Encoding"); enc != "aes128gcm" {
		t.Errorf("Content-Encoding = %q, want aes128gcm (RFC 8291)", enc)
	}
	if r.Header.Get("TTL") == "" {
		t.Error("delivery missing TTL header")
	}
}

func TestWebPush_GoneSubscriptionIsDropped(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	push := newFakePushService(t, http.StatusGone)
	registerSubscription(t, srv, userB, push.srv.URL+"/sub-gone")
	seedItem(t, srv, "item-1", "Zelt")

	pushAs(t, srv, userA, mutation("item-1", "m-delegate", "upsert",
		map[string]any{"packer_user_id": userB}, "0000000002000-0000-aaaaaaaa"))
	push.waitForDelivery(t)

	deadline := time.Now().Add(3 * time.Second)
	for {
		subs, err := st.PushSubscriptions(context.Background(), userB)
		if err != nil {
			t.Fatal(err)
		}
		if len(subs) == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("gone subscription still registered: %+v", subs)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestWebPush_VAPIDKeyStableAcrossRequests(t *testing.T) {
	srv := newTestServer(t)

	fetch := func() string {
		resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/push/vapid-key",
			token(t, userA, testSecret), nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("vapid-key status = %d", resp.StatusCode)
		}
		var out map[string]string
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatal(err)
		}
		return out["key"]
	}

	first := fetch()
	if first == "" {
		t.Fatal("empty VAPID public key")
	}
	if second := fetch(); second != first {
		t.Errorf("VAPID key changed between requests: %q vs %q", first, second)
	}
}

func TestWebPush_DeleteSubscriptionOwnerScoped(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	registerSubscription(t, srv, userB, "https://push.example/sub-b")

	// A foreign user cannot unregister B's device.
	resp, _ := doJSON(t, http.MethodDelete, srv.URL+"/api/v1/push/subscriptions",
		token(t, userA, testSecret), map[string]string{"endpoint": "https://push.example/sub-b"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("delete status = %d", resp.StatusCode)
	}
	if subs, _ := st.PushSubscriptions(context.Background(), userB); len(subs) != 1 {
		t.Fatalf("foreign delete removed the subscription")
	}

	resp, _ = doJSON(t, http.MethodDelete, srv.URL+"/api/v1/push/subscriptions",
		token(t, userB, testSecret), map[string]string{"endpoint": "https://push.example/sub-b"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("own delete status = %d", resp.StatusCode)
	}
	if subs, _ := st.PushSubscriptions(context.Background(), userB); len(subs) != 0 {
		t.Errorf("own delete left subscription behind: %+v", subs)
	}
}
