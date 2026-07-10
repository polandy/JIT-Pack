package main

import (
	"reflect"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		want    Config
		wantErr string
	}{
		{
			name: "multi-user with defaults",
			env:  map[string]string{"JITPACK_JWT_SECRET": "s3cret"},
			want: Config{
				Listen:    ":8080",
				DBPath:    "jitpack.db",
				JWTSecret: "s3cret",
			},
		},
		{
			name: "multi-user custom listen and db",
			env: map[string]string{
				"JITPACK_JWT_SECRET": "s3cret",
				"JITPACK_LISTEN":    ":9090",
				"JITPACK_DB_PATH":   "/data/app.db",
			},
			want: Config{
				Listen:    ":9090",
				DBPath:    "/data/app.db",
				JWTSecret: "s3cret",
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
			name: "multi-user with JWKS URL",
			env:  map[string]string{"JITPACK_JWKS_URL": "https://auth.example.com/.well-known/jwks.json"},
			want: Config{
				Listen:  ":8080",
				DBPath:  "jitpack.db",
				JWKSURL: "https://auth.example.com/.well-known/jwks.json",
			},
		},
		{
			name: "admin emails parsed and trimmed (FR-23.1)",
			env: map[string]string{
				"JITPACK_JWT_SECRET":     "s3cret",
				"JITPACK_ADMIN_EMAILS": "andy@example.com, sarah@example.com ,,",
			},
			want: Config{
				Listen:        ":8080",
				DBPath:        "jitpack.db",
				JWTSecret:     "s3cret",
				AdminEmails: []string{"andy@example.com", "sarah@example.com"},
			},
		},
		{
			name: "multi-user both secret and JWKS",
			env: map[string]string{
				"JITPACK_JWT_SECRET": "s3cret",
				"JITPACK_JWKS_URL":  "https://auth.example.com/.well-known/jwks.json",
			},
			wantErr: "mutually exclusive",
		},
		{
			name:    "multi-user missing secret and JWKS",
			env:     map[string]string{},
			wantErr: "JITPACK_JWT_SECRET or JITPACK_JWKS_URL is required",
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
