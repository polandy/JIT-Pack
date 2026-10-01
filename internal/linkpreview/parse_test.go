package linkpreview

import (
	"fmt"
	"net/url"
	"reflect"
	"strings"
	"testing"
)

func mustURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse %q: %v", raw, err)
	}
	return u
}

// FR-29.16: what a page says about itself, in the order a link preview
// trusts it — OpenGraph first, then Twitter's cards, then plain HTML.
func TestParse_ReadsWhatAPageSaysAboutItself_FR29_16(t *testing.T) {
	base := mustURL(t, "https://www.oeschinensee.ch/de/sommer/")
	cases := []struct {
		name string
		html string
		want Preview
	}{
		{
			name: "OpenGraph wins over the rest",
			html: `<html><head><title>Plain</title>
				<meta name="description" content="plain description">
				<meta property="og:title" content="Oeschinensee">
				<meta property="og:description" content="Ein Bergsee &amp; seine Wege">
				<meta name="twitter:image" content="/tw.jpg">
				<meta property="og:image" content="/img/see.jpg"></head></html>`,
			want: Preview{Title: "Oeschinensee", Description: "Ein Bergsee & seine Wege",
				ImageURL: "https://www.oeschinensee.ch/img/see.jpg"},
		},
		{
			name: "Twitter card where there is no OpenGraph",
			html: `<head><meta name="twitter:title" content="Hütte"><meta name="twitter:image" content="https://cdn.example.org/h.png"></head>`,
			want: Preview{Title: "Hütte", ImageURL: "https://cdn.example.org/h.png"},
		},
		{
			name: "plain title and description, attributes in any order and quoting",
			html: "<HEAD><TITLE>\n  Museo   Nivola \n</TITLE><meta content='Kunst im Dorf' name=description></HEAD>",
			want: Preview{Title: "Museo Nivola", Description: "Kunst im Dorf"},
		},
		{
			name: "a picture that is not a web address is no picture",
			html: `<meta property="og:image" content="javascript:alert(1)"><meta property="og:image:url" content="data:image/png;base64,AAAA">`,
			want: Preview{},
		},
		{
			name: "og:image:secure_url stands in for a missing og:image",
			html: `<meta property="og:image:secure_url" content="https://example.org/s.jpg">`,
			want: Preview{ImageURL: "https://example.org/s.jpg"},
		},
		{
			// segantini-museum.ch hyphenates its description for the
			// browser; on a card the marks would split words mid-line.
			name: "soft hyphens and zero-width marks are dropped",
			html: "<meta property=\"og:description\" content=\"Ich trin&shy;ke an die\u00adser reins\u200bte\">",
			want: Preview{Description: "Ich trinke an dieser reinste"},
		},
		{
			name: "nothing to say",
			html: `<html><body>hello</body></html>`,
			want: Preview{},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Parse([]byte(tc.html), base); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("Parse = %+v, want %+v", got, tc.want)
			}
		})
	}
}

// A page is somebody else's text: what reaches an idea is bounded.
func TestParse_CapsWhatItTakes_FR29_16(t *testing.T) {
	long := strings.Repeat("Wald ", 1000)
	got := Parse([]byte(`<meta property="og:title" content="`+long+`"><meta property="og:description" content="`+long+`">`),
		mustURL(t, "https://example.org/"))
	if n := len([]rune(got.Title)); n > MaxTitleRunes {
		t.Errorf("title has %d runes, want at most %d", n, MaxTitleRunes)
	}
	if n := len([]rune(got.Description)); n > MaxDescriptionRunes {
		t.Errorf("description has %d runes, want at most %d", n, MaxDescriptionRunes)
	}
}

// FR-29.18: a share page's links, for the client to find a connection among.
// The SBB app's short link answers a page whose one useful link carries the
// whole connection; an app's own scheme beside it is no web address.
func TestParse_ReadsThePagesLinks_FR29_18(t *testing.T) {
	trip := "https://www.sbb.ch/en/trip?tripId=3HA.eNqr.eNqr"
	doc := `<html><body>
		<a href="sbbmobile://trip?recon=3HA.x">Open in app</a>
		<a class="btn" href="` + trip + `">Open on sbb.ch</a>
		<a href='/help'>Help</a>
		<a href="` + trip + `">again</a>
		<a href="javascript:void(0)">nothing</a>
		<a name="anchor">no target</a>
	</body></html>`
	got := Parse([]byte(doc), mustURL(t, "https://a.sbbmobile.ch/s/73oNRti7"))
	want := []string{trip, "https://a.sbbmobile.ch/help"}
	if !reflect.DeepEqual(got.Links, want) {
		t.Errorf("Links = %q, want %q", got.Links, want)
	}
}

// A page is somebody else's text: the links handed on are bounded too.
func TestParse_CapsTheLinks_FR29_18(t *testing.T) {
	var doc strings.Builder
	for i := range MaxLinks + 10 {
		fmt.Fprintf(&doc, `<a href="https://example.org/%d">x</a>`, i)
	}
	got := Parse([]byte(doc.String()), mustURL(t, "https://example.org/"))
	if len(got.Links) != MaxLinks {
		t.Errorf("%d links, want at most %d", len(got.Links), MaxLinks)
	}
	long := Parse([]byte(`<a href="https://example.org/`+strings.Repeat("a", MaxLinkBytes)+`">x</a>`), mustURL(t, "https://example.org/"))
	if long.Links != nil {
		t.Errorf("a link over %d bytes was kept", MaxLinkBytes)
	}
}
