package store

import (
	"context"
	"testing"
)

// NFR-4.6 persistence: endpoint identity and server-key generation races.

func TestSavePushSubscription_EndpointRebinds(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-other', 'auth|o', 'Other')`)

	sub := PushSubscription{UserID: testUser, Endpoint: "https://push.example/e1", P256dh: "k1", Auth: "a1"}
	if err := s.SavePushSubscription(ctx, sub); err != nil {
		t.Fatal(err)
	}
	// Same device, new user (e.g. logout/login): the endpoint moves.
	sub.UserID = "user-other"
	sub.P256dh = "k2"
	if err := s.SavePushSubscription(ctx, sub); err != nil {
		t.Fatal(err)
	}

	if subs, _ := s.PushSubscriptions(ctx, testUser); len(subs) != 0 {
		t.Errorf("old user still owns the endpoint: %+v", subs)
	}
	subs, err := s.PushSubscriptions(ctx, "user-other")
	if err != nil || len(subs) != 1 || subs[0].P256dh != "k2" {
		t.Errorf("rebound subscription = %+v, err %v", subs, err)
	}
}

func TestSetServerKey_FirstWriterWins(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if err := s.SetServerKey(ctx, "vapid_public", "first"); err != nil {
		t.Fatal(err)
	}
	// A racing second startup must not replace the key.
	if err := s.SetServerKey(ctx, "vapid_public", "second"); err != nil {
		t.Fatal(err)
	}

	v, ok, err := s.ServerKey(ctx, "vapid_public")
	if err != nil || !ok || v != "first" {
		t.Errorf("ServerKey = %q/%v/%v, want first/true/nil", v, ok, err)
	}
	if _, ok, _ := s.ServerKey(ctx, "missing"); ok {
		t.Error("missing key must report ok=false")
	}
}
