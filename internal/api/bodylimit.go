package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// What a request body may weigh. Nothing bounded one before: the two binary
// uploads read through an io.LimitReader (ADR-002), but every JSON body was
// decoded straight off the connection, so one request could make the server
// allocate without limit.
const (
	// maxPushBodyBytes bounds a sync push. maxPushBatch caps how many
	// mutations one may carry, which is not the same promise: a mutation's
	// fields are free-form JSON, and the count is checked only once the whole
	// envelope is already in memory.
	//
	// It is set far above what the client can produce rather than close to
	// it, because the outbox treats a 4xx as a permanent refusal and parks
	// the whole chunk (Sync-API §5) — a limit a real device could reach would
	// cost the user their changes. A full batch of 200 trip_items rows with
	// every syncable column set measures around 200 KB.
	maxPushBodyBytes = 8 << 20

	// maxJSONBodyBytes bounds every other JSON body. All of them are
	// fixed-shape — a login code, a refresh token, a Web Push subscription, a
	// preferences map — and two of the endpoints answer before anyone has
	// proved who they are, which is why they get the tighter of the two.
	maxJSONBodyBytes = 64 << 10
)

// decodeJSON reads at most limit bytes of the request body into v. The reader
// is installed on the request rather than wrapped around the decoder so an
// oversized body fails while being read: what it is worth is what never gets
// allocated.
func decodeJSON(w http.ResponseWriter, r *http.Request, limit int64, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	return json.NewDecoder(r.Body).Decode(v)
}

// writeDecodeError answers a failed decodeJSON. A body refused for its size
// is its own answer and not the caller's "malformed": the sender's JSON was
// well-formed, and only that difference tells them whether a smaller request
// would be taken.
func writeDecodeError(w http.ResponseWriter, err error, malformed string) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeError(w, http.StatusRequestEntityTooLarge, ErrPayloadTooLarge,
			fmt.Sprintf("request body exceeds %d bytes", tooLarge.Limit))
		return
	}
	writeError(w, http.StatusUnprocessableEntity, ErrValidation, malformed)
}
