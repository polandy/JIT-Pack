package linkpreview

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"syscall"
	"time"
)

// What one preview may cost this server. The page is read only as far as a
// head is plausibly long; the picture as far as a camera photo is.
const (
	// MaxPageBytes is how much of a page is read for its head.
	MaxPageBytes = 1 << 20
	// MaxImageBytes caps the picture handed on to be scaled by the client.
	MaxImageBytes = 4 << 20
	// PageTimeout bounds reading the page.
	PageTimeout = 8 * time.Second
	// ImageTimeout bounds reading the picture, a request of its own: a
	// camera photo from a slow host takes longer than any head (measured
	// 2026-09-28: 1.4 s for oeschinensee.ch's page, 6–7 s for its picture).
	ImageTimeout = 15 * time.Second
	// maxRedirects follows a page's moves, but not a chain of them.
	maxRedirects = 3
)

var (
	// ErrNotWebLink is an address that is not http(s) with a host.
	ErrNotWebLink = errors.New("not a web link")
	// ErrBlockedAddress is an address this server does not reach for a
	// user: its own network, loopback, or a port that is not the web's.
	ErrBlockedAddress = errors.New("address not reachable for a preview")
	// ErrUnreadable is a page that did not answer with HTML.
	ErrUnreadable = errors.New("page could not be read")
)

// Fetcher reads link previews for FR-29.16 over a client that dials only
// what its policy allows.
type Fetcher struct {
	client *http.Client
}

// NewFetcher is the production fetcher: public addresses on the web's two
// ports, and nothing else.
func NewFetcher() *Fetcher { return newFetcher(PublicOnly) }

// newFetcher builds a fetcher over allow. The check runs in the dialer's
// Control hook — on the address actually dialled, after resolution — so a
// name resolving to a private address, a DNS answer that changes between
// two lookups, and a redirect inward are all refused alike.
func newFetcher(allow func(netip.AddrPort) bool) *Fetcher {
	dialer := &net.Dialer{
		Timeout: PageTimeout,
		Control: func(_, address string, _ syscall.RawConn) error {
			ap, err := netip.ParseAddrPort(address)
			if err != nil || !allow(ap) {
				return ErrBlockedAddress
			}
			return nil
		},
	}
	transport := &http.Transport{
		// No proxy from the environment: a proxy would be the address
		// dialled, and the page's own address would never be checked.
		Proxy:                 nil,
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   PageTimeout,
		ResponseHeaderTimeout: PageTimeout,
		MaxIdleConns:          4,
		IdleConnTimeout:       30 * time.Second,
	}
	return &Fetcher{client: &http.Client{
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return fmt.Errorf("%w: too many redirects", ErrUnreadable)
			}
			if !isWebScheme(req.URL.Scheme) {
				return ErrNotWebLink
			}
			return nil
		},
	}}
}

// PublicOnly is the production policy: a globally routable unicast address
// outside every private, shared and loopback range, on port 80 or 443.
func PublicOnly(ap netip.AddrPort) bool {
	if ap.Port() != 80 && ap.Port() != 443 {
		return false
	}
	addr := ap.Addr().Unmap()
	if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() {
		return false
	}
	return !sharedAddressSpace.Contains(addr)
}

// sharedAddressSpace is RFC 6598's carrier-grade NAT range, which
// IsPrivate does not name — and which a Tailscale network lives in.
var sharedAddressSpace = netip.MustParsePrefix("100.64.0.0/10")

// Fetch reads the page at raw for what it says about itself. Its picture is
// named, not read: FetchImage reads it on its own clock, so the words need
// not wait for a camera photo from a slow host.
func (f *Fetcher) Fetch(ctx context.Context, raw string) (Preview, error) {
	u, err := webLink(raw)
	if err != nil {
		return Preview{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, PageTimeout)
	defer cancel()
	doc, final, err := f.get(ctx, u, MaxPageBytes, isHTML)
	if err != nil {
		return Preview{}, err
	}
	return Parse(doc, final), nil
}

// FetchImage reads the picture at raw — an address the client hands back
// from Fetch's answer, and so a user's address like any other: the same
// fence, and only an image of at most MaxImageBytes.
func (f *Fetcher) FetchImage(ctx context.Context, raw string) ([]byte, string, error) {
	u, err := webLink(raw)
	if err != nil {
		return nil, "", err
	}
	ctx, cancel := context.WithTimeout(ctx, ImageTimeout)
	defer cancel()
	image, _, err := f.get(ctx, u, MaxImageBytes+1, isImage)
	if err != nil {
		return nil, "", err
	}
	if len(image) > MaxImageBytes {
		return nil, "", fmt.Errorf("%w: picture over %d bytes", ErrUnreadable, MaxImageBytes)
	}
	return image, http.DetectContentType(image), nil
}

// webLink is raw as an http(s) address with a host, or ErrNotWebLink.
func webLink(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || !isWebScheme(u.Scheme) || u.Hostname() == "" {
		return "", ErrNotWebLink
	}
	return u.String(), nil
}

// get reads at most limit bytes of raw, if its content type passes accept.
// It returns the URL the body finally came from, for resolving what it names.
func (f *Fetcher) get(ctx context.Context, raw string, limit int64, accept func(string) bool) ([]byte, *url.URL, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, nil, ErrNotWebLink
	}
	req.Header.Set("User-Agent", "JIT-Pack link preview")
	req.Header.Set("Accept", "text/html,image/*;q=0.9")
	resp, err := f.client.Do(req)
	if err != nil {
		if errors.Is(err, ErrBlockedAddress) || errors.Is(err, ErrNotWebLink) {
			return nil, nil, err
		}
		return nil, nil, fmt.Errorf("%w: %w", ErrUnreadable, err)
	}
	defer resp.Body.Close()
	mediaType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if resp.StatusCode != http.StatusOK || !accept(mediaType) {
		return nil, nil, fmt.Errorf("%w: %d %s", ErrUnreadable, resp.StatusCode, mediaType)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, limit))
	if err != nil {
		return nil, nil, fmt.Errorf("%w: %w", ErrUnreadable, err)
	}
	return body, resp.Request.URL, nil
}

func isHTML(mediaType string) bool {
	return mediaType == "text/html" || mediaType == "application/xhtml+xml"
}

func isImage(mediaType string) bool { return strings.HasPrefix(mediaType, "image/") }
