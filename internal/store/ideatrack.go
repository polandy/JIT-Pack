package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"unicode/utf8"

	"jitpack/internal/sync"
)

const (
	// MaxIdeaTrackBytes is FR-29.17's cap on one GPX file: 5 MB. Held three
	// times on purpose, like invariant 6's pictures — here, by the
	// idea_track_gpx CHECK and by the HTTP handler.
	MaxIdeaTrackBytes = 5 * 1024 * 1024
	// MaxIdeaTracks is how many tracks one idea carries (FR-29.17).
	MaxIdeaTracks = 5
	// MaxIdeaTrackLine is the longest drawn line a row holds, in characters
	// of its polyline string — what 800 points take with room to spare.
	MaxIdeaTrackLine = 16000
	// MaxIdeaTrackName and MaxIdeaTrackFileName bound the two names, as the
	// schema's CHECKs do.
	MaxIdeaTrackName     = 200
	MaxIdeaTrackFileName = 255
)

// The two kinds of track (FR-29.17), as the schema's CHECK names them.
const (
	IdeaTrackHike = "hike"
	IdeaTrackBike = "bike"
)

var (
	// ErrIdeaTrackTooLarge is returned for a file over MaxIdeaTrackBytes.
	ErrIdeaTrackTooLarge = errors.New("a GPX track exceeds the 5 MB limit")
	// ErrIdeaTrackLimit is returned for a track beyond MaxIdeaTracks.
	ErrIdeaTrackLimit = errors.New("an idea carries at most 5 tracks")
	// ErrIdeaTrackInvalid is returned for an upload whose name, kind,
	// figures or line the schema would refuse.
	ErrIdeaTrackInvalid = errors.New("a GPX track needs a name, a file name, a kind, its figures and its line")
)

// IdeaTrackFile is one upload: the file as it was chosen, and what the
// device that chose it read from it (ADR-085). The heights are nil for a
// file without any.
type IdeaTrackFile struct {
	Name       string
	FileName   string
	Kind       string
	DistanceM  int
	AscentM    *int
	DescentM   *int
	MaxEleM    *int
	PointCount int
	Line       string
	GPX        []byte
}

func (f IdeaTrackFile) valid() bool {
	return f.Name != "" && utf8.RuneCountInString(f.Name) <= MaxIdeaTrackName &&
		f.FileName != "" && utf8.RuneCountInString(f.FileName) <= MaxIdeaTrackFileName &&
		(f.Kind == IdeaTrackHike || f.Kind == IdeaTrackBike) &&
		f.DistanceM >= 0 && nonNegative(f.AscentM) && nonNegative(f.DescentM) &&
		f.PointCount >= 2 && f.Line != "" && len(f.Line) <= MaxIdeaTrackLine
}

func nonNegative(v *int) bool { return v == nil || *v >= 0 }

// IdeaTrack is what an upload answers: which track, the hash of its file
// and where it stands among its idea's tracks.
type IdeaTrack struct {
	ID       string
	Hash     string
	Position int
}

// ideaTrackFileFields are the columns an upload sets from the file — the
// ones a push may never change (validIdeaTrack).
var ideaTrackFileFields = []string{
	"file_name", "gpx_hash", "distance_m", "ascent_m", "descent_m", "max_ele_m", "point_count", columnLine,
}

// PutIdeaTrack stores a GPX track on an idea (FR-29.17) and logs its row on
// the trip's feed so every member's device pulls it. The file stays out of
// the envelope (ADR-002); the row is the only way a track comes to exist,
// which is why a push cannot insert one.
//
// The id is the client's. The same id with the same file — a retry whose
// answer was lost — changes nothing. The same id with another file replaces
// the file and what was read from it, and keeps what a person set: the
// name, the kind, with_kid, the pauses and the place.
func (s *Store) PutIdeaTrack(ctx context.Context, tripID, userID, ideaID, trackID string, f IdeaTrackFile) (IdeaTrack, error) {
	if len(f.GPX) > MaxIdeaTrackBytes {
		return IdeaTrack{}, ErrIdeaTrackTooLarge
	}
	if !f.valid() {
		return IdeaTrack{}, ErrIdeaTrackInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return IdeaTrack{}, fmt.Errorf("begin idea track tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit

	var onTrip bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM ideas WHERE id = ? AND trip_id = ?)`, ideaID, tripID).Scan(&onTrip); err != nil {
		return IdeaTrack{}, fmt.Errorf("find idea: %w", err)
	}
	if !onTrip {
		return IdeaTrack{}, ErrIdeaNotFound
	}

	sum := sha256.Sum256(f.GPX)
	hash := hex.EncodeToString(sum[:8])
	before, err := loadRow(ctx, tx, TableIdeaTracks, trackID)
	if err != nil {
		return IdeaTrack{}, err
	}
	if before.Exists && before.Fields["idea_id"] != ideaID {
		return IdeaTrack{}, ErrIdeaNotFound
	}

	var track IdeaTrack
	switch {
	case before.Exists && before.Fields["gpx_hash"] == hash:
		position, _ := before.Fields[columnPosition].(int64)
		return IdeaTrack{ID: trackID, Hash: hash, Position: int(position)}, nil
	case before.Exists:
		track, err = s.replaceIdeaTrack(ctx, tx, trackID, hash, before, f)
	default:
		track, err = s.insertIdeaTrack(ctx, tx, tripID, ideaID, trackID, hash, f)
	}
	if err != nil {
		return IdeaTrack{}, err
	}

	applied := map[string]any{
		"file_name": f.FileName, "gpx_hash": hash, "distance_m": int64(f.DistanceM),
		"ascent_m": optionalInt(f.AscentM), "descent_m": optionalInt(f.DescentM), "max_ele_m": optionalInt(f.MaxEleM),
		"point_count": int64(f.PointCount), columnLine: f.Line,
	}
	if !before.Exists {
		applied[columnTripID] = tripID
		applied["idea_id"] = ideaID
		applied[columnName] = f.Name
		applied[columnKind] = f.Kind
		applied[columnPosition] = int64(track.Position)
	}
	if err := recordActivity(ctx, tx, s.nowMillis(), activityWrite{
		feed: tripFeed(tripID), actorID: userID, table: TableIdeaTracks, id: trackID,
		before: before, applied: applied,
	}); err != nil {
		return IdeaTrack{}, err
	}
	if err := tx.Commit(); err != nil {
		return IdeaTrack{}, fmt.Errorf("commit idea track tx: %w", err)
	}
	return track, nil
}

func (s *Store) insertIdeaTrack(ctx context.Context, tx *sql.Tx, tripID, ideaID, trackID, hash string, f IdeaTrackFile) (IdeaTrack, error) {
	var count, next int
	if err := tx.QueryRowContext(ctx,
		`SELECT count(*), coalesce(max(position) + 1, 0) FROM idea_tracks WHERE idea_id = ?`,
		ideaID).Scan(&count, &next); err != nil {
		return IdeaTrack{}, fmt.Errorf("count idea tracks: %w", err)
	}
	if count >= MaxIdeaTracks {
		return IdeaTrack{}, ErrIdeaTrackLimit
	}
	hlc := s.hlc.Next()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO idea_tracks (id, trip_id, idea_id, name, file_name, kind, position, gpx_hash,
		   distance_m, ascent_m, descent_m, max_ele_m, point_count, line, updated_hlc)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		trackID, tripID, ideaID, f.Name, f.FileName, f.Kind, next, hash,
		f.DistanceM, f.AscentM, f.DescentM, f.MaxEleM, f.PointCount, f.Line, string(hlc)); err != nil {
		return IdeaTrack{}, fmt.Errorf("insert idea track: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO idea_track_gpx (track_id, gpx) VALUES (?, ?)`, trackID, f.GPX); err != nil {
		return IdeaTrack{}, fmt.Errorf("store idea track file: %w", err)
	}
	if _, err := appendChangeLog(ctx, tx, tripFeed(tripID),
		sync.Mutation{Table: TableIdeaTracks, ID: trackID, HLC: hlc}, false); err != nil {
		return IdeaTrack{}, fmt.Errorf("log idea track: %w", err)
	}
	return IdeaTrack{ID: trackID, Hash: hash, Position: next}, nil
}

// replaceIdeaTrack writes another file under an existing track. The fields
// a person set keep the clock they were last written with: one that never
// had its own is pinned to the row's old clock first, so the new row clock
// does not make it newer than an edit made before the file was replaced.
func (s *Store) replaceIdeaTrack(ctx context.Context, tx *sql.Tx, trackID, hash string, before sync.Row, f IdeaTrackFile) (IdeaTrack, error) {
	hlc := s.hlc.Next()
	clocks := sync.FieldClocks{}
	for field, clock := range before.Clocks {
		clocks[field] = clock
	}
	for field := range ideaTrackSettings {
		if _, ok := clocks[field]; !ok {
			clocks[field] = before.HLC
		}
	}
	for _, field := range ideaTrackFileFields {
		clocks[field] = hlc
	}
	encoded, err := encodeClocks(clocks)
	if err != nil {
		return IdeaTrack{}, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE idea_tracks SET file_name = ?, gpx_hash = ?, distance_m = ?, ascent_m = ?, descent_m = ?,
		   max_ele_m = ?, point_count = ?, line = ?, field_hlcs = ?, updated_hlc = ?
		 WHERE id = ?`,
		f.FileName, hash, f.DistanceM, f.AscentM, f.DescentM, f.MaxEleM, f.PointCount, f.Line,
		encoded, string(hlc), trackID); err != nil {
		return IdeaTrack{}, fmt.Errorf("replace idea track: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE idea_track_gpx SET gpx = ? WHERE track_id = ?`, f.GPX, trackID); err != nil {
		return IdeaTrack{}, fmt.Errorf("replace idea track file: %w", err)
	}
	tripID, _ := before.Fields[columnTripID].(string)
	if _, err := appendChangeLog(ctx, tx, tripFeed(tripID),
		sync.Mutation{Table: TableIdeaTracks, ID: trackID, HLC: hlc}, false); err != nil {
		return IdeaTrack{}, fmt.Errorf("log idea track: %w", err)
	}
	position, _ := before.Fields[columnPosition].(int64)
	return IdeaTrack{ID: trackID, Hash: hash, Position: int(position)}, nil
}

func optionalInt(v *int) any {
	if v == nil {
		return nil
	}
	return int64(*v)
}

// IdeaTrackGPX is one track's file as it was uploaded, with the name it
// was uploaded under and the hash the row carries.
type IdeaTrackGPX struct {
	GPX      []byte
	Hash     string
	FileName string
}

// GetIdeaTrackGPX returns one track's file, or nil when the trip's idea
// holds no such track — a track of another trip reads as missing, since the
// caller's membership was checked against this one.
func (s *Store) GetIdeaTrackGPX(ctx context.Context, tripID, ideaID, trackID string) (*IdeaTrackGPX, error) {
	var file IdeaTrackGPX
	err := s.db.QueryRowContext(ctx,
		`SELECT g.gpx, t.gpx_hash, t.file_name FROM idea_track_gpx g
		 JOIN idea_tracks t ON t.id = g.track_id
		 WHERE g.track_id = ? AND t.idea_id = ? AND t.trip_id = ?`, trackID, ideaID, tripID).
		Scan(&file.GPX, &file.Hash, &file.FileName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get idea track file: %w", err)
	}
	return &file, nil
}
