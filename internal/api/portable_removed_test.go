package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// ADR-025: the portable format has one implementation and it is the client's.
// These four routes were that second implementation; a re-add would revive a
// path that writes rows without a change-log entry, which no screen can see.
// The surviving NFR-4.5 exports are asserted beside them, so this is a
// statement about *which* endpoints are gone rather than a blanket 404.
func TestPortableYAMLEndpoints_AreGone(t *testing.T) {
	srv := newTestServer(t)
	bearer := "Bearer " + token(t, userA, testSecret)

	for _, tc := range []struct {
		name, method, path string
		want               int
	}{
		{"template import", http.MethodPost, "/api/v1/templates/import", http.StatusNotFound},
		{"trip import", http.MethodPost, "/api/v1/trips/import", http.StatusNotFound},
		{"template export", http.MethodGet, "/api/v1/templates/t1/export", http.StatusNotFound},
		{"trip YAML export", http.MethodGet, "/api/v1/trips/" + trip + "/export.yaml", http.StatusNotFound},
		// NFR-4.5 has no client-side twin and stays.
		{"trip CSV export", http.MethodGet, "/api/v1/trips/" + trip + "/export.csv", http.StatusOK},
		{"full JSON export", http.MethodGet, "/api/v1/export/full", http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest(tc.method, srv.URL+tc.path, strings.NewReader(""))
			req.Header.Set("Authorization", bearer)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.want {
				t.Errorf("%s %s = %d, want %d", tc.method, tc.path, resp.StatusCode, tc.want)
			}
		})
	}
}
