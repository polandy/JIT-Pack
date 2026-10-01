package api_test

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// GPX tracks at the HTTP edge (FR-29.17, ADR-085): the upload and the file
// are the trip's, like its pictures, and the file comes back only as a
// download.

const testTrackGPX = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="46.49" lon="7.67"/>` +
	`<trkpt lat="46.50" lon="7.70"/></trkseg></trk></gpx>`

func ideaTrackURL(srv *httptest.Server, ideaID, trackID string) string {
	return srv.URL + "/api/v1/trips/" + trip + "/ideas/" + ideaID + "/tracks/" + trackID
}

func trackUpload(gpx string) api.IdeaTrackUpload {
	ascent := 520
	return api.IdeaTrackUpload{
		Name: "Rundweg", FileName: "rundweg.gpx", Kind: api.TrackHike, DistanceM: 7400,
		AscentM: &ascent, PointCount: 2, Line: "_p~iF~ps|U_ulLnnqC", GPX: gpx,
	}
}

func TestIdeaTrack_AMemberUploadsAndAnotherDownloads_FR29_17(t *testing.T) {
	srv, _ := newIdeaImageServer(t)

	if resp, body := doJSON(t, http.MethodPut, ideaTrackURL(srv, "idea-1", "it-1"), token(t, userA, testSecret),
		trackUpload(testTrackGPX)); resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT status = %d: %s", resp.StatusCode, body)
	}

	resp, body := getWithBearer(t, ideaTrackURL(srv, "idea-1", "it-1"), token(t, userB, testSecret))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET status = %d", resp.StatusCode)
	}
	if string(body) != testTrackGPX {
		t.Errorf("GET = %q, want the file as it was uploaded", body)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/gpx+xml" {
		t.Errorf("Content-Type = %q, want application/gpx+xml", ct)
	}
	disposition, params, err := mime.ParseMediaType(resp.Header.Get("Content-Disposition"))
	if err != nil || disposition != "attachment" || params["filename"] != "rundweg.gpx" {
		t.Errorf("Content-Disposition = %q, want an attachment named rundweg.gpx", resp.Header.Get("Content-Disposition"))
	}
	if resp.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Error("no nosniff — a member's file could be rendered on this origin")
	}
}

func TestIdeaTrack_AStrangerNeitherUploadsNorDownloads_FR29_17(t *testing.T) {
	srv, _ := newIdeaImageServer(t)
	if resp, _ := doJSON(t, http.MethodPut, ideaTrackURL(srv, "idea-1", "it-1"), token(t, userA, testSecret),
		trackUpload(testTrackGPX)); resp.StatusCode != http.StatusOK {
		t.Fatalf("seed PUT status = %d", resp.StatusCode)
	}

	stranger := token(t, "user-x", testSecret)
	if resp, _ := doJSON(t, http.MethodPut, ideaTrackURL(srv, "idea-1", "it-2"), stranger,
		trackUpload(testTrackGPX)); resp.StatusCode != http.StatusForbidden {
		t.Errorf("stranger PUT status = %d, want 403", resp.StatusCode)
	}
	if resp, _ := getWithBearer(t, ideaTrackURL(srv, "idea-1", "it-1"), stranger); resp.StatusCode != http.StatusForbidden {
		t.Errorf("stranger GET status = %d, want 403", resp.StatusCode)
	}
}

func TestIdeaTrack_RefusedUploads_FR29_17(t *testing.T) {
	srv, _ := newIdeaImageServer(t)
	bearer := token(t, userA, testSecret)
	for _, id := range []string{"it-1", "it-2", "it-3", "it-4", "it-5"} {
		if resp, body := doJSON(t, http.MethodPut, ideaTrackURL(srv, "idea-1", id), bearer,
			trackUpload(testTrackGPX+id)); resp.StatusCode != http.StatusOK {
			t.Fatalf("PUT %s status = %d: %s", id, resp.StatusCode, body)
		}
	}
	ebike := trackUpload(testTrackGPX)
	ebike.Kind = "ebike"
	cases := []struct {
		name, ideaID string
		body         any
		want         int
	}{
		{"a sixth track", "idea-1", trackUpload(testTrackGPX), http.StatusUnprocessableEntity},
		{"over 5 MB", "idea-1", trackUpload(strings.Repeat("a", store.MaxIdeaTrackBytes+1)), http.StatusUnprocessableEntity},
		{"an unknown kind", "idea-1", ebike, http.StatusUnprocessableEntity},
		{"not JSON", "idea-1", "<gpx/>", http.StatusUnprocessableEntity},
		{"an idea that is not there", "idea-gone", trackUpload(testTrackGPX), http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if resp, body := doJSON(t, http.MethodPut, ideaTrackURL(srv, tc.ideaID, "it-new"), bearer, tc.body); resp.StatusCode != tc.want {
				t.Errorf("status = %d, want %d: %s", resp.StatusCode, tc.want, body)
			}
		})
	}
}

func TestIdeaTrack_GetOfAMissingTrackIs404_FR29_17(t *testing.T) {
	srv, _ := newIdeaImageServer(t)
	if resp, _ := getWithBearer(t, ideaTrackURL(srv, "idea-1", "it-none"), token(t, userA, testSecret)); resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}
