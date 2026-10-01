package api

import (
	"context"
	"encoding/json"
	"math"
	"testing"
	"time"
)

// FR-29.19 at the hub, with fake peers: who is told a position, who is not,
// and when a position ends. Absences are asserted by a later frame arriving
// first — never by waiting for nothing.

type locationPeers struct {
	hub              *Hub
	andy, sia, other *conn
	siaPeer          *fakePeer
	otherPeer        *fakePeer
	clock            *time.Time
}

// threeOnATrip leaves andy and sia subscribed to trip-1 and a third account
// subscribed too but refused by the gate, with a hand-set clock.
func threeOnATrip(t *testing.T) locationPeers {
	t.Helper()
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	gate := func(_ context.Context, _ string, userID string) bool { return userID != "eve" }
	hub := NewHub(nil, gate)
	hub.now = func() time.Time { return now }
	andyPeer, siaPeer, otherPeer := newFakePeer(false), newFakePeer(false), newFakePeer(false)
	andy, sia, other := newConn(andyPeer, "andy"), newConn(siaPeer, "sia"), newConn(otherPeer, "eve")
	for _, c := range []*conn{andy, sia, other} {
		hub.Register(c)
		hub.Subscribe(c, "trip-1")
	}
	t.Cleanup(func() {
		for _, c := range []*conn{andy, sia, other} {
			hub.Unregister(c)
		}
	})
	return locationPeers{hub: hub, andy: andy, sia: sia, other: other, siaPeer: siaPeer, otherPeer: otherPeer, clock: &now}
}

// nextLocation reads a peer's frames up to its next location frame.
func nextLocation(t *testing.T, p *fakePeer) map[string]any {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case data := <-p.got:
			var evt WSEvent
			if err := json.Unmarshal(data, &evt); err != nil {
				t.Fatalf("unmarshal frame: %v", err)
			}
			if evt.Type == EventLocation {
				return evt.Payload
			}
		case <-deadline:
			t.Fatal("no location frame")
			return nil
		}
	}
}

func TestLiveLocation_AFixReachesTheOthersStampedByTheServer_FR29_19(t *testing.T) {
	p := threeOnATrip(t)

	p.hub.SetLocation(p.andy, "trip-1", 46.5, 9.84, 12)

	got := nextLocation(t, p.siaPeer)
	want := map[string]any{
		"trip_id": "trip-1", "user_id": "andy", "lat": 46.5, "lon": 9.84, "accuracy_m": 12.0,
		"at": "2026-10-01T09:00:00Z", "gone": false,
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
}

func TestLiveLocation_NeitherTheSenderNorARefusedMemberIsTold_FR29_19(t *testing.T) {
	p := threeOnATrip(t)
	andyPeer2 := newFakePeer(false)
	andy2 := newConn(andyPeer2, "andy")
	p.hub.Register(andy2)
	p.hub.Subscribe(andy2, "trip-1")
	t.Cleanup(func() { p.hub.Unregister(andy2) })

	p.hub.SetLocation(p.andy, "trip-1", 46.5, 9.84, 12)
	// Sia's fix is the positive signal: had andy's own device or eve been
	// sent andy's, it would arrive before hers.
	*p.clock = p.clock.Add(time.Second)
	p.hub.SetLocation(p.sia, "trip-1", 46.6, 9.9, 8)

	if got := nextLocation(t, andyPeer2); got["user_id"] != "sia" {
		t.Errorf("andy's second device got %v first, want sia's — never his own", got["user_id"])
	}
	// Eve is refused every trip event, so her marker is an account frame,
	// queued after both fixes: a location before it would have been sent.
	p.hub.NotifyMasterChanged("eve", 7)
	for {
		var evt WSEvent
		if err := json.Unmarshal(<-p.otherPeer.got, &evt); err != nil {
			t.Fatalf("unmarshal frame: %v", err)
		}
		if evt.Type == EventLocation {
			t.Fatalf("a member the gate refuses was sent a location: %v", evt.Payload)
		}
		if evt.Type == EventMasterChanged {
			break
		}
	}
}

func TestLiveLocation_AFixOffTheEarthIsDropped_FR29_19(t *testing.T) {
	cases := []struct {
		name          string
		lat, lon, acc float64
	}{
		{"latitude past the pole", 91, 9, 5},
		{"longitude past the date line", 46, 181, 5},
		{"not a number", math.NaN(), 9, 5},
		{"a negative accuracy", 46, 9, -1},
		{"an infinite accuracy", 46, 9, math.Inf(1)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := threeOnATrip(t)
			p.hub.SetLocation(p.andy, "trip-1", tc.lat, tc.lon, tc.acc)
			p.hub.SetLocation(p.andy, "trip-1", 46.5, 9.84, 12)
			if got := nextLocation(t, p.siaPeer); got["lat"] != 46.5 {
				t.Errorf("first fix sia got = %v, want the valid one", got["lat"])
			}
		})
	}
}

func TestLiveLocation_AFixTooSoonAfterTheLastIsDropped_FR29_19(t *testing.T) {
	p := threeOnATrip(t)

	p.hub.SetLocation(p.andy, "trip-1", 46.5, 9.84, 12)
	*p.clock = p.clock.Add(liveLocationMinInterval - time.Millisecond)
	p.hub.SetLocation(p.andy, "trip-1", 46.6, 9.84, 12)
	*p.clock = p.clock.Add(time.Millisecond)
	p.hub.SetLocation(p.andy, "trip-1", 46.7, 9.84, 12)

	first, second := nextLocation(t, p.siaPeer), nextLocation(t, p.siaPeer)
	if first["lat"] != 46.5 || second["lat"] != 46.7 {
		t.Errorf("sia got %v then %v, want 46.5 then 46.7 — the fix in between was too soon", first["lat"], second["lat"])
	}
}

func TestLiveLocation_ALateSubscriberIsGivenWhatIsSharedNow_FR29_19(t *testing.T) {
	p := threeOnATrip(t)
	p.hub.SetLocation(p.andy, "trip-1", 46.5, 9.84, 12)

	latePeer := newFakePeer(false)
	late := newConn(latePeer, "lia")
	p.hub.Register(late)
	t.Cleanup(func() { p.hub.Unregister(late) })
	p.hub.Subscribe(late, "trip-1")

	if got := nextLocation(t, latePeer); got["user_id"] != "andy" || got["lat"] != 46.5 {
		t.Errorf("late subscriber got %v, want andy's position", got)
	}
}

func TestLiveLocation_StopUnsubscribeAndDisconnectEndIt_FR29_19(t *testing.T) {
	ends := map[string]func(p locationPeers){
		"stop":        func(p locationPeers) { p.hub.ClearLocation(p.andy, "trip-1") },
		"unsubscribe": func(p locationPeers) { p.hub.Unsubscribe(p.andy, "trip-1") },
		"disconnect":  func(p locationPeers) { p.hub.Unregister(p.andy) },
	}
	for name, end := range ends {
		t.Run(name, func(t *testing.T) {
			p := threeOnATrip(t)
			p.hub.SetLocation(p.andy, "trip-1", 46.5, 9.84, 12)
			nextLocation(t, p.siaPeer)

			end(p)

			if got := nextLocation(t, p.siaPeer); got["user_id"] != "andy" || got["gone"] != true {
				t.Errorf("after %s sia got %v, want andy gone", name, got)
			}
		})
	}
}

func TestLiveLocation_AnotherDeviceStillSharingSpeaksForThePerson_FR29_19(t *testing.T) {
	p := threeOnATrip(t)
	phone := newConn(newFakePeer(false), "andy")
	p.hub.Register(phone)
	p.hub.Subscribe(phone, "trip-1")
	t.Cleanup(func() { p.hub.Unregister(phone) })

	p.hub.SetLocation(p.andy, "trip-1", 46.5, 9.84, 12)
	*p.clock = p.clock.Add(time.Second)
	p.hub.SetLocation(phone, "trip-1", 46.6, 9.85, 6)
	nextLocation(t, p.siaPeer)
	nextLocation(t, p.siaPeer)

	p.hub.Unregister(p.andy)

	if got := nextLocation(t, p.siaPeer); got["gone"] != false || got["lat"] != 46.6 {
		t.Errorf("after one device left sia got %v, want the phone's position still", got)
	}
}
