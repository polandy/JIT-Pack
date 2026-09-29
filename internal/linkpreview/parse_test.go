package linkpreview

import (
	"net/url"
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
			if got := Parse([]byte(tc.html), base); got != tc.want {
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
