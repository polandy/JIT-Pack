// Package linkpreview reads what a web page says about itself — its title,
// a description and a picture — for FR-29.16's link preview. It is a leaf:
// the standard library only, nothing internal, so the one place this server
// fetches a page chosen by a user is small enough to read whole.
package linkpreview

import (
	"html"
	"net/url"
	"regexp"
	"strings"
	"unicode"
)

// What a preview takes from a page it did not write.
const (
	// MaxTitleRunes bounds a title: an idea's title is a line on a card.
	MaxTitleRunes = 200
	// MaxDescriptionRunes bounds a description, which becomes an idea's note.
	MaxDescriptionRunes = 1000
)

// Preview is what a page says about itself. Every field may be empty.
type Preview struct {
	Title       string
	Description string
	// ImageURL is absolute and http(s), or empty.
	ImageURL string
}

// The keys a page names its preview by, most trusted first.
var (
	titleKeys       = []string{"og:title", "twitter:title"}
	descriptionKeys = []string{"og:description", "twitter:description", "description"}
	imageKeys       = []string{"og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"}
)

var (
	metaTag   = regexp.MustCompile(`(?is)<meta\b([^>]*)>`)
	attribute = regexp.MustCompile(`(?s)([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`)
	titleTag  = regexp.MustCompile(`(?is)<title\b[^>]*>(.*?)</title>`)
)

// Parse reads the preview out of an HTML document. It is not an HTML
// parser: the tags a preview lives in are flat `<meta>` lines in the head,
// and a pattern over them is what every link-preview reader in practice
// does. A relative picture is resolved against base.
func Parse(doc []byte, base *url.URL) Preview {
	metas := map[string]string{}
	for _, tag := range metaTag.FindAllSubmatch(doc, -1) {
		attrs := map[string]string{}
		for _, a := range attribute.FindAllSubmatch(tag[1], -1) {
			attrs[strings.ToLower(string(a[1]))] = string(a[2]) + string(a[3]) + string(a[4])
		}
		key := strings.ToLower(attrs["property"])
		if key == "" {
			key = strings.ToLower(attrs["name"])
		}
		if _, seen := metas[key]; key != "" && !seen {
			metas[key] = attrs["content"]
		}
	}

	p := Preview{
		Title:       clean(first(metas, titleKeys), MaxTitleRunes),
		Description: clean(first(metas, descriptionKeys), MaxDescriptionRunes),
		ImageURL:    webURL(first(metas, imageKeys), base),
	}
	if p.Title == "" {
		if m := titleTag.FindSubmatch(doc); m != nil {
			p.Title = clean(string(m[1]), MaxTitleRunes)
		}
	}
	return p
}

func first(metas map[string]string, keys []string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(metas[key]); v != "" {
			return v
		}
	}
	return ""
}

// clean unescapes entities, folds runs of whitespace into one space and
// cuts at limit runes.
func clean(s string, limit int) string {
	s = strings.Join(strings.FieldsFunc(html.UnescapeString(s), unicode.IsSpace), " ")
	if r := []rune(s); len(r) > limit {
		s = strings.TrimSpace(string(r[:limit]))
	}
	return s
}

// webURL resolves raw against base and keeps it only as an http(s) address.
func webURL(raw string, base *url.URL) string {
	if raw == "" {
		return ""
	}
	ref, err := url.Parse(html.UnescapeString(raw))
	if err != nil {
		return ""
	}
	abs := base.ResolveReference(ref)
	if (abs.Scheme != "http" && abs.Scheme != "https") || abs.Host == "" {
		return ""
	}
	return abs.String()
}
