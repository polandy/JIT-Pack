package store

import (
	crand "crypto/rand"
	"fmt"
)

// randomID mints a row id. It is the Go side of the same shape the client
// generates, so a row's origin is not readable from its id.
func randomID() string {
	var b [16]byte
	_, _ = crand.Read(b[:])
	return fmt.Sprintf("%x", b)
}
