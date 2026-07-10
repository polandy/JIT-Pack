package store

import (
	"context"
	"errors"
	"testing"
)

// Instance user management (Addendum 3.23): declarative admin stamping
// via EnsureOIDCUser (FR-23.1), deactivate/reactivate without touching
// data (FR-23.3), profile intervention (FR-23.4), and the admin
// overview (FR-23.2).

func TestEnsureOIDCUser_StampsInstanceAdmin(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	// First sight with the subject on the admin list.
	id, err := s.EnsureOIDCUser(ctx, "auth|dana", "Dana", "dana@example.com", true)
	if err != nil {
		t.Fatal(err)
	}
	adminFlag := func() int {
		t.Helper()
		var v int
		if err := s.db.QueryRow(`SELECT is_instance_admin FROM users WHERE id = ?`, id).Scan(&v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	if adminFlag() != 1 {
		t.Error("provisioning with isAdmin must stamp the flag")
	}

	// The env list is authoritative in both directions (FR-23.1):
	// removal from the list revokes at the next login.
	if _, err := s.EnsureOIDCUser(ctx, "auth|dana", "Dana", "dana@example.com", false); err != nil {
		t.Fatal(err)
	}
	if adminFlag() != 0 {
		t.Error("re-login without isAdmin must revoke the flag")
	}
	if _, err := s.EnsureOIDCUser(ctx, "auth|dana", "Dana", "dana@example.com", true); err != nil {
		t.Fatal(err)
	}
	if adminFlag() != 1 {
		t.Error("re-login with isAdmin must restore the flag")
	}
}

// FR-23.1 architecture note: the email claim lands in users.email on
// every login (feeds the FR-23.2 overview, follows IdP-side changes);
// a token without the claim leaves the stored address alone.
func TestEnsureOIDCUser_StampsEmail(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	id, err := s.EnsureOIDCUser(ctx, "auth|gina", "Gina", "gina@example.com", false)
	if err != nil {
		t.Fatal(err)
	}
	email := func() string {
		t.Helper()
		var v string
		if err := s.db.QueryRow(`SELECT COALESCE(email, '') FROM users WHERE id = ?`, id).Scan(&v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	if email() != "gina@example.com" {
		t.Errorf("email = %q after provisioning", email())
	}

	if _, err := s.EnsureOIDCUser(ctx, "auth|gina", "Gina", "gina@new.example", false); err != nil {
		t.Fatal(err)
	}
	if email() != "gina@new.example" {
		t.Errorf("email = %q, want the IdP-side change followed", email())
	}

	if _, err := s.EnsureOIDCUser(ctx, "auth|gina", "Gina", "", false); err != nil {
		t.Fatal(err)
	}
	if email() != "gina@new.example" {
		t.Errorf("email = %q, an absent claim must not erase it", email())
	}
}

// FR-23.4: a reset display name ('') falls back to the IdP-provided
// name at the account's next login, exactly like initial provisioning.
func TestEnsureOIDCUser_RestampsResetDisplayName(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	id, err := s.EnsureOIDCUser(ctx, "auth|erik", "Rude Name", "", false)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ResetDisplayName(ctx, id); err != nil {
		t.Fatal(err)
	}
	var name string
	if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, id).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "" {
		t.Fatalf("reset name = %q, want empty", name)
	}

	if _, err := s.EnsureOIDCUser(ctx, "auth|erik", "Erik", "", false); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, id).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Erik" {
		t.Errorf("next login must re-stamp the IdP name, got %q", name)
	}

	// A user-chosen name survives logins untouched.
	mustExec(t, s, `UPDATE users SET display_name = 'Custom' WHERE id = ?`, id)
	if _, err := s.EnsureOIDCUser(ctx, "auth|erik", "Erik", "", false); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(`SELECT display_name FROM users WHERE id = ?`, id).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Custom" {
		t.Errorf("login must not overwrite a set name, got %q", name)
	}
}

func TestDeactivateUser_Lifecycle(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	ctx := context.Background()

	// Deactivation drops push subscriptions (FR-23.3 side effect).
	if err := s.SavePushSubscription(ctx, PushSubscription{
		UserID: testUserB, Endpoint: "https://push.example/b", P256dh: "p", Auth: "a",
	}); err != nil {
		t.Fatal(err)
	}

	if err := s.DeactivateUser(ctx, testUserB); err != nil {
		t.Fatal(err)
	}
	deactivated, err := s.UserDeactivated(ctx, testUserB)
	if err != nil {
		t.Fatal(err)
	}
	if !deactivated {
		t.Error("user must be deactivated")
	}
	subs, err := s.PushSubscriptions(ctx, testUserB)
	if err != nil {
		t.Fatal(err)
	}
	if len(subs) != 0 {
		t.Error("deactivation must delete push subscriptions")
	}

	// Data stays untouched: the membership row survives (FR-23.3).
	mustExec(t, s, `INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'editor')`, testTrip, testUserB)

	if err := s.ReactivateUser(ctx, testUserB); err != nil {
		t.Fatal(err)
	}
	deactivated, err = s.UserDeactivated(ctx, testUserB)
	if err != nil {
		t.Fatal(err)
	}
	if deactivated {
		t.Error("user must be active after reactivation")
	}
}

func TestDeactivateUser_AdminAndMissing(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	mustExec(t, s, `UPDATE users SET is_instance_admin = 1 WHERE id = ?`, testUserB)

	// Admins cannot be deactivated (FR-23.3): the operator removes them
	// from JITPACK_ADMIN_EMAILS first.
	if err := s.DeactivateUser(context.Background(), testUserB); !errors.Is(err, ErrAdminUndeactivatable) {
		t.Errorf("deactivate admin err = %v, want ErrAdminUndeactivatable", err)
	}
	if err := s.DeactivateUser(context.Background(), "nobody"); !errors.Is(err, ErrUserNotFound) {
		t.Errorf("deactivate missing err = %v, want ErrUserNotFound", err)
	}
}

// FR-23.2: the overview lists every account with status and lightweight
// usage counts (trip memberships, owned templates).
func TestAdminUsers_Overview(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	ctx := context.Background()
	mustExec(t, s, `UPDATE users SET is_instance_admin = 1 WHERE id = ?`, testUser)
	mustExec(t, s, `INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`, testTrip, testUser)
	mustExec(t, s, `INSERT INTO templates (id, owner_id, name) VALUES ('tpl-ov', ?, 'Basis')`, testUser)
	if err := s.DeactivateUser(ctx, testUserB); err != nil {
		t.Fatal(err)
	}

	users, err := s.AdminUsers(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 2 {
		t.Fatalf("len = %d, want 2", len(users))
	}
	andy := users[0] // ordered by display name: Andy, Berta
	if andy.DisplayName != "Andy" || !andy.IsInstanceAdmin || andy.DeactivatedAt != nil {
		t.Errorf("andy = %+v", andy)
	}
	if andy.TripCount != 1 || andy.TemplateCount != 1 {
		t.Errorf("andy counts = %d/%d, want 1/1", andy.TripCount, andy.TemplateCount)
	}
	if andy.CreatedAt == "" {
		t.Error("provisioning date missing")
	}
	berta := users[1]
	if berta.DeactivatedAt == nil || berta.IsInstanceAdmin {
		t.Errorf("berta = %+v", berta)
	}
	if berta.TripCount != 0 || berta.TemplateCount != 0 {
		t.Errorf("berta counts = %d/%d, want 0/0", berta.TripCount, berta.TemplateCount)
	}
}

// FR-23.3/23.6: a deactivated account vanishes from the member picker
// and receives no new notifications; open JIT provisioning must not
// resurrect it.
func TestDeactivatedUser_ExcludedFromDirectoryAndNotifications(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	id, err := s.EnsureOIDCUser(ctx, "auth|frida", "Frida", "", false)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.DeactivateUser(ctx, id); err != nil {
		t.Fatal(err)
	}

	users, err := s.ListUsers(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, u := range users {
		if u.UserID == id {
			t.Error("deactivated account must not appear in the directory")
		}
	}

	nid, err := s.CreateNotification(ctx, id, NotifyMention, map[string]any{"trip_id": testTrip})
	if err != nil {
		t.Fatal(err)
	}
	if nid != "" {
		t.Error("no notifications for deactivated targets")
	}

	// JIT provisioning does not reactivate (FR-23.3/23.6).
	again, err := s.EnsureOIDCUser(ctx, "auth|frida", "Frida", "", false)
	if err != nil {
		t.Fatal(err)
	}
	if again != id {
		t.Fatalf("provisioning must reuse the row, got %s vs %s", again, id)
	}
	deactivated, err := s.UserDeactivated(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if !deactivated {
		t.Error("a login must not reactivate a deactivated account")
	}
}

// FR-23.4: avatar removal clears image and mime together.
func TestResetAvatar(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `UPDATE users SET avatar_image = X'FFD8FF', avatar_mime = 'image/jpeg' WHERE id = ?`, testUser)

	if err := s.ResetAvatar(context.Background(), testUser); err != nil {
		t.Fatal(err)
	}
	var img, mime any
	if err := s.db.QueryRow(`SELECT avatar_image, avatar_mime FROM users WHERE id = ?`, testUser).Scan(&img, &mime); err != nil {
		t.Fatal(err)
	}
	if img != nil || mime != nil {
		t.Error("avatar must be fully cleared")
	}
}
