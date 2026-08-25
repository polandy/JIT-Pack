package store

import (
	crand "crypto/rand"
	"fmt"
)

// randomID mints a row id. It is the Go side of the same shape the client
// generates, so a row's origin is not readable from its id.
//
// The discarded error is the one case where discarding is the whole truth:
// since Go 1.24 crypto/rand.Read never returns one — it fills b entirely or
// crashes the program irrecoverably. There is no branch in which this
// returns an id built from an unread buffer, and so nothing to log or to
// test. (The client's twin has no such guarantee and therefore does refuse
// — client/src/lib/ids.ts.)
func randomID() string {
	var b [16]byte
	_, _ = crand.Read(b[:])
	return fmt.Sprintf("%x", b)
}
