package api

import (
	"context"
	"math"
	"time"
)

// Live location (FR-29.19, ADR-087): a traveller's position, passed from
// their socket to the other members of the trip and kept nowhere but here —
// on the connection that shares it, for as long as it lives.

// liveLocationMinInterval is the least time between two fixes a connection
// may hand on for one trip. The client sends far less often; this is the
// floor a misbehaving one cannot go under, so one socket cannot turn the hub
// into a firehose for everybody on the trip.
const liveLocationMinInterval = 2 * time.Second

// maxAccuracyM caps the accuracy a fix may claim, in metres. A browser
// reports kilometres for a position guessed from the network; the number is
// kept as said up to this, since the map draws it as a circle.
const maxAccuracyM = 10_000

// liveFix is one connection's latest position on one trip, stamped with the
// server's clock when it arrived.
type liveFix struct {
	lat, lon, accuracyM float64
	at                  time.Time
}

// validFix reports whether a claimed position is one on Earth. NaN and the
// infinities fail every comparison, so they fail here too.
func validFix(lat, lon, accuracyM float64) bool {
	return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 &&
		accuracyM >= 0 && !math.IsInf(accuracyM, 0)
}

// payload is the frame's body: the sharer, stamped by the server rather than
// claimed, and where and when.
func (f liveFix) payload(tripID, userID string) LiveLocation {
	return LiveLocation{
		TripID:    tripID,
		UserID:    userID,
		Lat:       f.lat,
		Lon:       f.lon,
		AccuracyM: math.Min(f.accuracyM, maxAccuracyM),
		At:        f.at.UTC().Format(time.RFC3339),
	}
}

// locationEvent wraps one location payload in its frame.
func locationEvent(l LiveLocation) WSEvent {
	return WSEvent{Type: EventLocation, Payload: map[string]any{
		"trip_id":    l.TripID,
		"user_id":    l.UserID,
		"lat":        l.Lat,
		"lon":        l.Lon,
		"accuracy_m": l.AccuracyM,
		"at":         l.At,
		"gone":       l.Gone,
	}}
}

// SetLocation records where a connection's person is on a trip and tells the
// trip's other people. The caller has checked membership, as for Subscribe; a
// fix off the Earth, or one arriving sooner than liveLocationMinInterval after
// the last, is dropped without a word.
func (h *Hub) SetLocation(c *conn, tripID string, lat, lon, accuracyM float64) {
	if !validFix(lat, lon, accuracyM) {
		return
	}
	now := h.clock()
	h.mu.Lock()
	if last, ok := c.locations[tripID]; ok && now.Sub(last.at) < liveLocationMinInterval {
		h.mu.Unlock()
		return
	}
	fix := liveFix{lat: lat, lon: lon, accuracyM: accuracyM, at: now}
	c.locations[tripID] = fix
	h.mu.Unlock()

	h.sendToOthers(c.userID, tripID, locationEvent(fix.payload(tripID, c.userID)))
}

// ClearLocation ends a connection's sharing on a trip.
func (h *Hub) ClearLocation(c *conn, tripID string) {
	h.mu.Lock()
	_, shared := c.locations[tripID]
	delete(c.locations, tripID)
	h.mu.Unlock()
	if shared {
		h.announceGone(c.userID, tripID)
	}
}

// clearAllLocations ends every share of a connection that is going away.
func (h *Hub) clearAllLocations(c *conn) {
	h.mu.Lock()
	trips := make([]string, 0, len(c.locations))
	for tripID := range c.locations {
		trips = append(trips, tripID)
	}
	c.locations = map[string]liveFix{}
	h.mu.Unlock()
	for _, tripID := range trips {
		h.announceGone(c.userID, tripID)
	}
}

// announceGone tells the trip a person no longer shares — unless another of
// their devices still does, which then speaks for them.
func (h *Hub) announceGone(userID, tripID string) {
	h.mu.Lock()
	var still *liveFix
	for other := range h.conns {
		if fix, ok := other.locations[tripID]; ok && other.userID == userID {
			if still == nil || fix.at.After(still.at) {
				f := fix
				still = &f
			}
		}
	}
	h.mu.Unlock()
	if still != nil {
		h.sendToOthers(userID, tripID, locationEvent(still.payload(tripID, userID)))
		return
	}
	h.sendToOthers(userID, tripID, locationEvent(LiveLocation{TripID: tripID, UserID: userID, Gone: true}))
}

// sendLocationsTo gives a connection that has just subscribed to a trip the
// positions shared on it now, its own person's excepted.
func (h *Hub) sendLocationsTo(c *conn, tripID string) {
	if h.mayReceive == nil || !h.mayReceive(context.Background(), tripID, c.userID) {
		return
	}
	h.mu.Lock()
	newest := map[string]liveFix{}
	for other := range h.conns {
		if other.userID == c.userID {
			continue
		}
		if fix, ok := other.locations[tripID]; ok {
			if prev, seen := newest[other.userID]; !seen || fix.at.After(prev.at) {
				newest[other.userID] = fix
			}
		}
	}
	h.mu.Unlock()
	for userID, fix := range newest {
		h.send([]*conn{c}, locationEvent(fix.payload(tripID, userID)))
	}
}

// sendToOthers sends a trip event to its subscribers but the person it is
// about: their own position is on their own device already.
func (h *Hub) sendToOthers(userID, tripID string, evt WSEvent) {
	targets := h.subscribersOf(tripID)
	others := targets[:0]
	for _, t := range targets {
		if t.userID != userID {
			others = append(others, t)
		}
	}
	h.send(others, evt)
}

// clock is the hub's time, a seam so the throttle is tested by the clock a
// test sets rather than by waiting.
func (h *Hub) clock() time.Time {
	return h.now()
}
