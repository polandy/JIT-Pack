package portable

import (
	"bytes"
	"strings"
)

// DocumentResult is one document of a portable file, in the order the file
// lists it: either the document or the reason it could not be read.
type DocumentResult struct {
	Doc Document
	// Raw is the document exactly as the file spells it. FR-18.5 makes a
	// field this build does not know a thing to carry, not a thing to drop,
	// so anything forwarding a document sends these bytes rather than
	// re-serializing Doc — which would keep only what the Go type models.
	Raw []byte
	Err error
}

// documentSeparator is the line that starts a new document in a
// multi-document YAML file. Only a bare occurrence in the first column
// separates: inside the format's own values a "---" is always indented,
// because YAML indents block scalars.
const documentSeparator = "---"

// UnmarshalAll parses a portable file that may hold one document or many
// (FR-18.4), validating each on its own.
//
// A document that cannot be read — including one that is not valid YAML — is
// reported in its place and the intact ones around it are still returned,
// because a restore that gives up on the first bad document loses everything
// behind it. That is why the file is split before it is parsed rather than
// read as a stream: a YAML stream decoder scans ahead, so a single typo
// anywhere costs every document in front of it too.
func UnmarshalAll(data []byte) []DocumentResult {
	var results []DocumentResult
	for _, chunk := range splitDocuments(data) {
		doc, err := Unmarshal(chunk)
		if err != nil {
			results = append(results, DocumentResult{Raw: chunk, Err: err})
			continue
		}
		results = append(results, DocumentResult{Doc: doc, Raw: chunk})
	}
	return results
}

// splitDocuments cuts a multi-document file into its documents, dropping the
// empty ones a leading or trailing separator produces — those are
// punctuation, not something to import.
func splitDocuments(data []byte) [][]byte {
	var docs [][]byte
	var current [][]byte
	flush := func() {
		joined := bytes.Join(current, []byte("\n"))
		current = nil
		if len(bytes.TrimSpace(joined)) > 0 {
			docs = append(docs, joined)
		}
	}
	for _, line := range bytes.Split(data, []byte("\n")) {
		if isSeparator(line) {
			flush()
			continue
		}
		current = append(current, line)
	}
	flush()
	return docs
}

func isSeparator(line []byte) bool {
	text := strings.TrimRight(string(line), " \t\r")
	return text == documentSeparator || strings.HasPrefix(text, documentSeparator+" ")
}
