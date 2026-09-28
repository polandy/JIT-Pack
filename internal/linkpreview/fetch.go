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
	// FetchTimeout bounds both requests together.
	FetchTimeout = 8 * time.Second
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

// Page is a preview with its picture's bytes, when the picture could be had.
type Page struct {
	Preview
	Image     []byte
	ImageType string
}

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
		Timeout: FetchTimeout,
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
		TLSHandshakeTimeout:   FetchTimeout,
		ResponseHeaderTimeout: FetchTimeout,
		MaxIdleConns:          4,
		IdleConnTimeout:       30 * time.Second,
	}
	return &Fetcher{client: &http.Client{
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return fmt.Errorf("%w: too many redirects", ErrUnreadable)
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
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

// Fetch reads the page at raw and, where it names one, its picture. A
// picture that cannot be had leaves the preview without one; a page that
// cannot be had is an error.
func (f *Fetcher) Fetch(ctx context.Context, raw string) (Page, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" {
		return Page{}, ErrNotWebLink
	}
	ctx, cancel := context.WithTimeout(ctx, FetchTimeout)
	defer cancel()

	doc, final, err := f.get(ctx, u.String(), MaxPageBytes, isHTML)
	if err != nil {
		return Page{}, err
	}
	page := Page{Preview: Parse(doc, final)}
	if page.ImageURL != "" {
		if image, _, err := f.get(ctx, page.ImageURL, MaxImageBytes+1, isImage); err == nil && len(image) <= MaxImageBytes {
			page.Image = image
			page.ImageType = http.DetectContentType(image)
		}
	}
	return page, nil
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
