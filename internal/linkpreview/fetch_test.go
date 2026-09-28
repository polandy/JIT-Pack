package linkpreview

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

// allowAll lets a test reach its own httptest server, which listens on
// loopback — the one address class the real policy must refuse.
func allowAll(netip.AddrPort) bool { return true }

var jpegBytes = []byte("\xff\xd8\xff\xe0 pretend jpeg")

func page(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv
}

func TestFetch_ReadsThePageAndItsPicture_FR29_16(t *testing.T) {
	srv := page(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/see":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(`<meta property="og:title" content="Oeschinensee"><meta property="og:image" content="/see.jpg">`))
		case "/see.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			w.Write(jpegBytes)
		default:
			http.NotFound(w, r)
		}
	})

	got, err := newFetcher(allowAll).Fetch(context.Background(), srv.URL+"/see")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if got.Title != "Oeschinensee" || !bytes.Equal(got.Image, jpegBytes) || got.ImageType != "image/jpeg" {
		t.Errorf("Fetch = %q, %d image bytes of %q; want the title and the picture", got.Title, len(got.Image), got.ImageType)
	}
}

// A preview without its picture is still a preview: the picture is a
// second request to a second host, and either may fail on its own.
func TestFetch_APictureThatCannotBeHadLeavesThePreview_FR29_16(t *testing.T) {
	cases := map[string]http.HandlerFunc{
		"missing": http.NotFound,
		"not an image": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte("<html>"))
		},
		"too large": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "image/jpeg")
			w.Write(make([]byte, MaxImageBytes+1))
		},
	}
	for name, image := range cases {
		t.Run(name, func(t *testing.T) {
			srv := page(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/img" {
					image(w, r)
					return
				}
				w.Header().Set("Content-Type", "text/html")
				w.Write([]byte(`<title>Hütte</title><meta property="og:image" content="/img">`))
			})
			got, err := newFetcher(allowAll).Fetch(context.Background(), srv.URL)
			if err != nil || got.Title != "Hütte" || got.Image != nil {
				t.Errorf("Fetch = %q with %d image bytes, err %v; want the title alone", got.Title, len(got.Image), err)
			}
		})
	}
}

func TestFetch_RefusesWhatIsNotAWebPage_FR29_16(t *testing.T) {
	srv := page(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/pdf":
			w.Header().Set("Content-Type", "application/pdf")
			w.Write([]byte("%PDF"))
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
	})
	cases := map[string]struct {
		url  string
		want error
	}{
		"a file scheme":         {"file:///etc/passwd", ErrNotWebLink},
		"no host":               {"https://", ErrNotWebLink},
		"a PDF":                 {srv.URL + "/pdf", ErrUnreadable},
		"a server error":        {srv.URL + "/boom", ErrUnreadable},
		"nobody listening here": {"http://127.0.0.1:1/", ErrUnreadable},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := newFetcher(allowAll).Fetch(context.Background(), tc.url); !errors.Is(err, tc.want) {
				t.Errorf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

// The reason the fetcher exists as its own package: a user names the
// address, and the server must not become their way into its own network
// (SSRF). The check sits in the dialer, on the address actually dialled, so
// a name that resolves to loopback — or re-resolves there — is caught too.
func TestFetch_TheRealPolicyRefusesThisServersOwnNetwork_FR29_16(t *testing.T) {
	srv := page(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<title>internal</title>`))
	})
	if _, err := NewFetcher().Fetch(context.Background(), srv.URL); !errors.Is(err, ErrBlockedAddress) {
		t.Errorf("loopback: err = %v, want ErrBlockedAddress", err)
	}
}

// A public page that redirects inward is refused at the redirect's dial.
func TestFetch_ARedirectIsCheckedLikeTheFirstRequest_FR29_16(t *testing.T) {
	inner := page(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<title>router admin</title>`))
	})
	outer := page(t, func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, inner.URL, http.StatusFound)
	})
	outerAddr := netip.MustParseAddrPort(outer.Listener.Addr().String())
	onlyOuter := func(ap netip.AddrPort) bool { return ap == outerAddr }

	if _, err := newFetcher(onlyOuter).Fetch(context.Background(), outer.URL); !errors.Is(err, ErrBlockedAddress) {
		t.Errorf("err = %v, want ErrBlockedAddress", err)
	}
}

func TestPublicOnly_FR29_16(t *testing.T) {
	cases := map[string]bool{
		"93.184.215.14:443":       true,
		"93.184.215.14:80":        true,
		"[2606:4700::6810:1]:443": true,
		"93.184.215.14:22":        false, // only the web's own ports
		"127.0.0.1:443":           false,
		"[::1]:443":               false,
		"10.0.0.1:443":            false,
		"172.16.5.4:80":           false,
		"192.168.1.110:443":       false,
		"169.254.169.254:80":      false, // cloud metadata
		"100.64.0.1:443":          false, // carrier-grade NAT, Tailscale
		"0.0.0.0:80":              false,
		"[fd00::1]:443":           false,
		"[fe80::1]:443":           false,
		"[::ffff:127.0.0.1]:80":   false, // loopback dressed as IPv6
		"224.0.0.1:80":            false,
	}
	for raw, want := range cases {
		t.Run(raw, func(t *testing.T) {
			if got := PublicOnly(netip.MustParseAddrPort(raw)); got != want {
				t.Errorf("PublicOnly(%s) = %v, want %v", raw, got, want)
			}
		})
	}
}
