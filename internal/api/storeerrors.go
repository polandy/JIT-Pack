package api

import (
	"net/http"

	"jitpack/internal/store"
)

// storeErrorResponses is the one place a store refusal becomes an HTTP
// answer. It replaced five hand-written switches and five inline `if`s
// across eight files, which is what made the same failure able to read
// two ways depending on which endpoint met it — `ErrItemNotFound` was
// already spelled out twice, identically, by hand.
//
// A row with no message answers with the sentinel's own sentence. That is
// deliberate and confined to the three limits whose text a user has to
// read to know what to do about it ("avatar exceeds 100 KB limit"): the
// number is then written once, in the store, rather than copied into a
// second sentence here that nothing would keep in step.
var storeErrorResponses = []errorResponse{
	{store.ErrUserNotFound, http.StatusNotFound, ErrNotFound, "no such user"},
	// FR-23.3: remove the address from JITPACK_ADMIN_EMAILS first.
	{store.ErrAdminUndeactivatable, http.StatusConflict, ErrAdminUndeactivatable, "instance admins cannot be deactivated"},
	{store.ErrSessionNotFound, http.StatusUnauthorized, ErrUnauthorized, "unknown or expired session"},
	{store.ErrNotificationNotFound, http.StatusNotFound, ErrNotificationNotFound, "no such notification"},

	// Every revert refusal keeps its own code, because each is a different
	// sentence for the user: the entry is spent, the row is gone, the merge
	// rules outrank the revert, or it was never theirs to make.
	{store.ErrConflictNotFound, http.StatusNotFound, ErrConflictNotFound, "no such conflict entry"},
	{store.ErrConflictAlreadyReverted, http.StatusConflict, ErrAlreadyReverted, "this conflict was already reverted"},
	{store.ErrConflictRowGone, http.StatusConflict, ErrRowDeleted, "the row this conflict names has been deleted"},
	{store.ErrRevertRefused, http.StatusConflict, ErrRevertRefused, "the merge rules refuse this revert"},
	{store.ErrRevertForbidden, http.StatusForbidden, ErrForbidden, "not allowed to write this row"},

	// FR-5.7 takeover: the row is gone, nobody is holding it, or it is
	// already the caller's.
	{store.ErrTripItemNotFound, http.StatusNotFound, ErrNotFound, "no such item on this trip"},
	{store.ErrClaimNotHeld, http.StatusConflict, ErrClaimNotHeld, "nobody is packing this row"},
	{store.ErrClaimIsOwn, http.StatusConflict, ErrClaimIsOwn, "this row is already yours"},

	{store.ErrMasterRowNotFound, http.StatusNotFound, ErrNotFound, "no such row"},
	// Unreachable through the mux, which binds only allowlisted tables:
	// reaching it means a route was wired to a table the store refuses,
	// which is this server's bug and not the caller's.
	{store.ErrMasterTableNotDeletable, http.StatusInternalServerError, ErrInternal, "table has no delete endpoint"},

	{store.ErrItemNotFound, http.StatusNotFound, ErrNotFound, "no such item"},
	{store.ErrItemImageTooLarge, http.StatusUnprocessableEntity, ErrValidation, ""},
	{store.ErrAvatarTooLarge, http.StatusUnprocessableEntity, ErrValidation, ""},
	{store.ErrInvalidDisplayName, http.StatusUnprocessableEntity, ErrValidation, ""},
}

// writeStoreError answers a store failure. The fallback sentence stays the
// handler's, because "revert failed" and "admin action failed" are not the
// same thing to read — the table decides what a *known* refusal means, not
// what an unknown one is called.
func writeStoreError(w http.ResponseWriter, err error, fallback string) {
	if !answerFrom(w, storeErrorResponses, err) {
		writeError(w, http.StatusInternalServerError, ErrInternal, fallback)
	}
}
