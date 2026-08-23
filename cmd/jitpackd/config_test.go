package main

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// The configuration surface follows the session-brokering model (ADR-007):
// JIT-Pack always signs its own session tokens (JITPACK_SESSION_SECRET), and
// the OIDC group — issuer, client id, client secret — configures the login
// broker on top. The issuer is the only OIDC endpoint the operator provides;
// authorize/token/JWKS/userinfo all come from its discovery document.
func TestLoadConfig(t *testing.T) {
	oidc := map[string]string{
		"JITPACK_SESSION_SECRET":     "s3cret",
		"JITPACK_OIDC_ISSUER":        "https://auth.example.com",
		"JITPACK_OIDC_CLIENT_ID":     "jitpack",
		"JITPACK_OIDC_CLIENT_SECRET": "confidential",
	}

	tests := []struct {
		name    string
		env     map[string]string
		want    Config
		wantErr string
	}{
		{
			name: "multi-user with defaults",
			env:  map[string]string{"JITPACK_SESSION_SECRET": "s3cret"},
			want: Config{
				Listen:        ":8080",
				DBPath:        "jitpack.db",
				SessionSecret: "s3cret",
			},
		},
		{
			name: "multi-user custom listen and db",
			env: map[string]string{
				"JITPACK_SESSION_SECRET": "s3cret",
				"JITPACK_LISTEN":         ":9090",
				"JITPACK_DB_PATH":        "/data/app.db",
			},
			want: Config{
				Listen:        ":9090",
				DBPath:        "/data/app.db",
				SessionSecret: "s3cret",
			},
		},
		{
			name: "single-user mode",
			env: map[string]string{
				"JITPACK_SINGLE_USER":   "true",
				"JITPACK_LOCAL_USER_ID": "solo",
			},
			want: Config{
				Listen:      ":8080",
				DBPath:      "jitpack.db",
				SingleUser:  true,
				LocalUserID: "solo",
			},
		},
		{
			name: "multi-user with OIDC broker",
			env:  oidc,
			want: Config{
				Listen:           ":8080",
				DBPath:           "jitpack.db",
				SessionSecret:    "s3cret",
				OIDCIssuer:       "https://auth.example.com",
				OIDCClientID:     "jitpack",
				OIDCClientSecret: "confidential",
			},
		},
		{
			// Discovery URLs are built by appending to the issuer, so a
			// trailing slash would produce double-slash paths.
			name: "issuer trailing slash trimmed",
			env: merge(oidc, map[string]string{
				"JITPACK_OIDC_ISSUER": "https://auth.example.com/",
			}),
			want: Config{
				Listen:           ":8080",
				DBPath:           "jitpack.db",
				SessionSecret:    "s3cret",
				OIDCIssuer:       "https://auth.example.com",
				OIDCClientID:     "jitpack",
				OIDCClientSecret: "confidential",
			},
		},
		{
			name: "admin emails parsed and trimmed (FR-23.1)",
			env: map[string]string{
				"JITPACK_SESSION_SECRET": "s3cret",
				"JITPACK_ADMIN_EMAILS":   "andy@example.com, sarah@example.com ,,",
			},
			want: Config{
				Listen:        ":8080",
				DBPath:        "jitpack.db",
				SessionSecret: "s3cret",
				AdminEmails:   []string{"andy@example.com", "sarah@example.com"},
			},
		},
		{
			name:    "multi-user missing session secret",
			env:     map[string]string{},
			wantErr: "JITPACK_SESSION_SECRET is required",
		},
		{
			// The session secret signs what the broker issues; OIDC config
			// alone cannot stand in for it.
			name: "multi-user OIDC without session secret",
			env: merge(oidc, map[string]string{
				"JITPACK_SESSION_SECRET": "",
			}),
			wantErr: "JITPACK_SESSION_SECRET is required",
		},
		{
			name: "OIDC group incomplete",
			env: merge(oidc, map[string]string{
				"JITPACK_OIDC_CLIENT_SECRET": "",
			}),
			wantErr: "must be set together",
		},
		{
			name: "single-user missing local user ID",
			env: map[string]string{
				"JITPACK_SINGLE_USER": "true",
			},
			wantErr: "JITPACK_LOCAL_USER_ID is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			getenv := func(key string) string { return tt.env[key] }
			got, err := loadConfigFrom(getenv)

			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErr)
				}
				if !contains(err.Error(), tt.wantErr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

func merge(base, override map[string]string) map[string]string {
	out := make(map[string]string, len(base)+len(override))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range override {
		out[k] = v
	}
	return out
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Sync-API §7: the G-3 lock staleness window is an operator setting, not
// a client constant. Unset leaves the zero value so the API layer's own
// DefaultLockTimeout stays the single place the 15 minutes are written.
func TestLoadConfig_LockTimeout(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    time.Duration
		wantErr string
	}{
		{name: "unset leaves the server default", value: "", want: 0},
		{name: "duration string", value: "45m", want: 45 * time.Minute},
		{name: "seconds granularity", value: "90s", want: 90 * time.Second},
		{
			name:    "unparseable value is refused, never silently defaulted",
			value:   "fifteen minutes",
			wantErr: "JITPACK_LOCK_TIMEOUT",
		},
		{
			name:    "zero would disable G-3 by accident",
			value:   "0s",
			wantErr: "JITPACK_LOCK_TIMEOUT",
		},
		{
			name:    "negative is refused",
			value:   "-5m",
			wantErr: "JITPACK_LOCK_TIMEOUT",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			env := map[string]string{"JITPACK_SESSION_SECRET": "s3cret"}
			if tt.value != "" {
				env["JITPACK_LOCK_TIMEOUT"] = tt.value
			}
			got, err := loadConfigFrom(func(k string) string { return env[k] })
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err = %v, want one naming %s", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.LockTimeout != tt.want {
				t.Fatalf("LockTimeout = %v, want %v", got.LockTimeout, tt.want)
			}
		})
	}
}
