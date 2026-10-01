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
	// MaxTrackBytes is FR-29.17's cap on one GPX file: 5 MB. Held three
	// times on purpose, like invariant 6's pictures — here, by the
	// idea_track_gpx and excursion_track_gpx CHECKs and by the HTTP handler.
	MaxTrackBytes = 5 * 1024 * 1024
	// MaxTracks is how many tracks one idea or one excursion carries
	// (FR-29.17, FR-31.15).
	MaxTracks = 5
	// MaxTrackLine is the longest drawn line a row holds, in characters
	// of its polyline string — what 800 points take with room to spare.
	MaxTrackLine = 16000
	// MaxTrackName and MaxTrackFileName bound the two names, as the
	// schema's CHECKs do.
	MaxTrackName     = 200
	MaxTrackFileName = 255
)

// The two kinds of track (FR-29.17), as the schema's CHECK names them.
const (
	TrackHike = "hike"
	TrackBike = "bike"
)

var (
	// ErrTrackTooLarge is returned for a file over MaxTrackBytes.
	ErrTrackTooLarge = errors.New("a GPX track exceeds the 5 MB limit")
	// ErrTrackLimit is returned for a track beyond MaxTracks.
	ErrTrackLimit = errors.New("an idea or an excursion carries at most 5 tracks")
	// ErrExcursionNotFound is returned for a track put on an excursion that
	// is not on the trip.
	ErrExcursionNotFound = errors.New("excursion not found")
	// ErrTrackInvalid is returned for an upload whose name, kind,
	// figures or line the schema would refuse.
	ErrTrackInvalid = errors.New("a GPX track needs a name, a file name, a kind, its figures and its line")
)

// TrackFile is one upload: the file as it was chosen, and what the
// device that chose it read from it (ADR-085). The heights are nil for a
// file without any.
type TrackFile struct {
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

func (f TrackFile) valid() bool {
	return f.Name != "" && utf8.RuneCountInString(f.Name) <= MaxTrackName &&
		f.FileName != "" && utf8.RuneCountInString(f.FileName) <= MaxTrackFileName &&
		(f.Kind == TrackHike || f.Kind == TrackBike) &&
		f.DistanceM >= 0 && nonNegative(f.AscentM) && nonNegative(f.DescentM) &&
		f.PointCount >= 2 && f.Line != "" && len(f.Line) <= MaxTrackLine
}

func nonNegative(v *int) bool { return v == nil || *v >= 0 }

// Track is what an upload answers: which track, the hash of its file and
// where it stands among the tracks of what it hangs on.
type Track struct {
	ID       string
	Hash     string
	Position int
}

// trackFileFields are the columns an upload sets from the file — the ones a
// push may never change (validTrack).
var trackFileFields = []string{
	"file_name", "gpx_hash", "distance_m", "ascent_m", "descent_m", "max_ele_m", "point_count", columnLine,
}

// trackHolder is what a set of tracks hangs on — an idea (FR-29.17) or an
// excursion (FR-31.15): the two hold their tracks in tables of their own,
// alike column for column but the holder's (ADR-089).
type trackHolder struct {
	// table is the synced half, gpxTable the file's.
	table, gpxTable string
	// column names the holder on a track's row; holders is the holder's table.
	column, holders string
	// notFound is answered for a holder that is not on the trip.
	notFound error
}

var (
	ideaTracks      = trackHolder{TableIdeaTracks, "idea_track_gpx", "idea_id", TableIdeas, ErrIdeaNotFound}
	excursionTracks = trackHolder{TableExcursionTracks, "excursion_track_gpx", "excursion_id", TableExcursions, ErrExcursionNotFound}
)

// PutIdeaTrack stores a GPX track on an idea (FR-29.17) and logs its row on
// the trip's feed so every member's device pulls it. The file stays out of
// the envelope (ADR-002); the row is the only way a track comes to exist,
// which is why a push cannot insert one.
//
// The id is the client's. The same id with the same file — a retry whose
// answer was lost — changes nothing. The same id with another file replaces
// the file and what was read from it, and keeps what a person set: the
// name, the kind, with_kid, the pauses and the place.
func (s *Store) PutIdeaTrack(ctx context.Context, tripID, userID, ideaID, trackID string, f TrackFile) (Track, error) {
	return s.putTrack(ctx, ideaTracks, tripID, userID, ideaID, trackID, f)
}

// PutExcursionTrack stores a GPX track on an excursion (FR-31.15), as
// PutIdeaTrack does on an idea.
func (s *Store) PutExcursionTrack(ctx context.Context, tripID, userID, excursionID, trackID string, f TrackFile) (Track, error) {
	return s.putTrack(ctx, excursionTracks, tripID, userID, excursionID, trackID, f)
}

func (s *Store) putTrack(ctx context.Context, h trackHolder, tripID, userID, holderID, trackID string, f TrackFile) (Track, error) {
	if len(f.GPX) > MaxTrackBytes {
		return Track{}, ErrTrackTooLarge
	}
	if !f.valid() {
		return Track{}, ErrTrackInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Track{}, fmt.Errorf("begin track tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit

	var onTrip bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM `+h.holders+` WHERE id = ? AND trip_id = ?)`, holderID, tripID).Scan(&onTrip); err != nil {
		return Track{}, fmt.Errorf("find %s: %w", h.holders, err)
	}
	if !onTrip {
		return Track{}, h.notFound
	}

	sum := sha256.Sum256(f.GPX)
	hash := hex.EncodeToString(sum[:8])
	before, err := loadRow(ctx, tx, h.table, trackID)
	if err != nil {
		return Track{}, err
	}
	if before.Exists && before.Fields[h.column] != holderID {
		return Track{}, h.notFound
	}

	var track Track
	hlc := s.hlc.Next()
	switch {
	case before.Exists && before.Fields["gpx_hash"] == hash:
		position, _ := before.Fields[columnPosition].(int64)
		return Track{ID: trackID, Hash: hash, Position: int(position)}, nil
	case before.Exists:
		track, err = replaceTrack(ctx, tx, h, hlc, trackID, hash, before, f)
	default:
		track, err = insertTrack(ctx, tx, h, hlc, tripID, holderID, trackID, hash, f)
	}
	if err != nil {
		return Track{}, err
	}
	if _, err := appendChangeLog(ctx, tx, tripFeed(tripID),
		sync.Mutation{Table: h.table, ID: trackID, HLC: hlc}, false); err != nil {
		return Track{}, fmt.Errorf("log track: %w", err)
	}

	applied := map[string]any{
		"file_name": f.FileName, "gpx_hash": hash, "distance_m": int64(f.DistanceM),
		"ascent_m": optionalInt(f.AscentM), "descent_m": optionalInt(f.DescentM), "max_ele_m": optionalInt(f.MaxEleM),
		"point_count": int64(f.PointCount), columnLine: f.Line,
	}
	if !before.Exists {
		applied[columnTripID] = tripID
		applied[h.column] = holderID
		applied[columnName] = f.Name
		applied[columnKind] = f.Kind
		applied[columnPosition] = int64(track.Position)
	}
	if err := recordActivity(ctx, tx, s.nowMillis(), activityWrite{
		feed: tripFeed(tripID), actorID: userID, table: h.table, id: trackID,
		before: before, applied: applied,
	}); err != nil {
		return Track{}, err
	}
	if err := tx.Commit(); err != nil {
		return Track{}, fmt.Errorf("commit track tx: %w", err)
	}
	return track, nil
}

func insertTrack(ctx context.Context, tx *sql.Tx, h trackHolder, hlc sync.HLC, tripID, holderID, trackID, hash string, f TrackFile) (Track, error) {
	var count, next int
	if err := tx.QueryRowContext(ctx,
		`SELECT count(*), coalesce(max(position) + 1, 0) FROM `+h.table+` WHERE `+h.column+` = ?`,
		holderID).Scan(&count, &next); err != nil {
		return Track{}, fmt.Errorf("count tracks: %w", err)
	}
	if count >= MaxTracks {
		return Track{}, ErrTrackLimit
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO `+h.table+` (id, trip_id, `+h.column+`, name, file_name, kind, position, gpx_hash,
		   distance_m, ascent_m, descent_m, max_ele_m, point_count, line, updated_hlc)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		trackID, tripID, holderID, f.Name, f.FileName, f.Kind, next, hash,
		f.DistanceM, f.AscentM, f.DescentM, f.MaxEleM, f.PointCount, f.Line, string(hlc)); err != nil {
		return Track{}, fmt.Errorf("insert track: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO `+h.gpxTable+` (track_id, gpx) VALUES (?, ?)`, trackID, f.GPX); err != nil {
		return Track{}, fmt.Errorf("store track file: %w", err)
	}
	return Track{ID: trackID, Hash: hash, Position: next}, nil
}

// replaceTrack writes another file under an existing track. The fields a
// person set keep the clock they were last written with: one that never had
// its own is pinned to the row's old clock first, so the new row clock does
// not make it newer than an edit made before the file was replaced.
func replaceTrack(ctx context.Context, tx *sql.Tx, h trackHolder, hlc sync.HLC, trackID, hash string, before sync.Row, f TrackFile) (Track, error) {
	clocks := sync.FieldClocks{}
	for field, clock := range before.Clocks {
		clocks[field] = clock
	}
	for field := range trackSettings {
		if _, ok := clocks[field]; !ok {
			clocks[field] = before.HLC
		}
	}
	for _, field := range trackFileFields {
		clocks[field] = hlc
	}
	encoded, err := encodeClocks(clocks)
	if err != nil {
		return Track{}, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE `+h.table+` SET file_name = ?, gpx_hash = ?, distance_m = ?, ascent_m = ?, descent_m = ?,
		   max_ele_m = ?, point_count = ?, line = ?, field_hlcs = ?, updated_hlc = ?
		 WHERE id = ?`,
		f.FileName, hash, f.DistanceM, f.AscentM, f.DescentM, f.MaxEleM, f.PointCount, f.Line,
		encoded, string(hlc), trackID); err != nil {
		return Track{}, fmt.Errorf("replace track: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE `+h.gpxTable+` SET gpx = ? WHERE track_id = ?`, f.GPX, trackID); err != nil {
		return Track{}, fmt.Errorf("replace track file: %w", err)
	}
	position, _ := before.Fields[columnPosition].(int64)
	return Track{ID: trackID, Hash: hash, Position: int(position)}, nil
}

func optionalInt(v *int) any {
	if v == nil {
		return nil
	}
	return int64(*v)
}

// TrackGPX is one track's file as it was uploaded, with the name it was
// uploaded under and the hash the row carries.
type TrackGPX struct {
	GPX      []byte
	Hash     string
	FileName string
}

// GetIdeaTrackGPX returns one track's file, or nil when the trip's idea
// holds no such track — a track of another trip reads as missing, since the
// caller's membership was checked against this one.
func (s *Store) GetIdeaTrackGPX(ctx context.Context, tripID, ideaID, trackID string) (*TrackGPX, error) {
	return s.trackGPX(ctx, ideaTracks, tripID, ideaID, trackID)
}

// GetExcursionTrackGPX returns one excursion track's file (FR-31.15), as
// GetIdeaTrackGPX does an idea's.
func (s *Store) GetExcursionTrackGPX(ctx context.Context, tripID, excursionID, trackID string) (*TrackGPX, error) {
	return s.trackGPX(ctx, excursionTracks, tripID, excursionID, trackID)
}

func (s *Store) trackGPX(ctx context.Context, h trackHolder, tripID, holderID, trackID string) (*TrackGPX, error) {
	var file TrackGPX
	err := s.db.QueryRowContext(ctx,
		`SELECT g.gpx, t.gpx_hash, t.file_name FROM `+h.gpxTable+` g
		 JOIN `+h.table+` t ON t.id = g.track_id
		 WHERE g.track_id = ? AND t.`+h.column+` = ? AND t.trip_id = ?`, trackID, holderID, tripID).
		Scan(&file.GPX, &file.Hash, &file.FileName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get track file: %w", err)
	}
	return &file, nil
}
