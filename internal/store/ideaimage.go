package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"

	"jitpack/internal/sync"
)

const (
	// MaxIdeaImageBytes is FR-29.5's cap on one idea picture: 500 KB. Held
	// three times on purpose, like invariant 6's item photo — here, by the
	// idea_image_bytes CHECK and by the HTTP handler.
	MaxIdeaImageBytes = 500 * 1024
	// MaxIdeaImages is how many pictures one idea carries (FR-29.5).
	MaxIdeaImages = 4
)

var (
	// ErrIdeaImageTooLarge is returned for a picture over MaxIdeaImageBytes.
	ErrIdeaImageTooLarge = errors.New("idea picture exceeds 500 KB limit")
	// ErrIdeaImageLimit is returned for a picture beyond MaxIdeaImages.
	ErrIdeaImageLimit = errors.New("an idea carries at most 4 pictures")
	// ErrIdeaNotFound is returned when a picture names an idea that is not
	// on the trip it was sent to.
	ErrIdeaNotFound = errors.New("idea not found")
)

// IdeaImage is one stored picture's synced half: which it is, the hash of
// its bytes and where it stands among its idea's pictures.
type IdeaImage struct {
	ID       string
	Hash     string
	Position int
}

// AddIdeaImage stores a picture on an idea (FR-29.5) behind its last one,
// and logs the new row on the trip's feed so every member's device pulls it.
// The bytes stay out of the envelope (ADR-002); the row is the only way a
// picture comes to exist, which is why a push cannot insert one.
//
// The id is the client's, so an upload that is retried after its answer was
// lost is recognised and changes nothing.
func (s *Store) AddIdeaImage(ctx context.Context, tripID, userID, ideaID, imageID string, jpeg []byte) (IdeaImage, error) {
	if len(jpeg) > MaxIdeaImageBytes {
		return IdeaImage{}, ErrIdeaImageTooLarge
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return IdeaImage{}, fmt.Errorf("begin idea image tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit

	var onTrip bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM ideas WHERE id = ? AND trip_id = ?)`, ideaID, tripID).Scan(&onTrip); err != nil {
		return IdeaImage{}, fmt.Errorf("find idea: %w", err)
	}
	if !onTrip {
		return IdeaImage{}, ErrIdeaNotFound
	}

	var known IdeaImage
	switch err := tx.QueryRowContext(ctx,
		`SELECT id, image_hash, position FROM idea_images WHERE id = ? AND idea_id = ?`,
		imageID, ideaID).Scan(&known.ID, &known.Hash, &known.Position); {
	case err == nil:
		return known, nil
	case !errors.Is(err, sql.ErrNoRows):
		return IdeaImage{}, fmt.Errorf("find idea image: %w", err)
	}

	var count, next int
	if err := tx.QueryRowContext(ctx,
		`SELECT count(*), coalesce(max(position) + 1, 0) FROM idea_images WHERE idea_id = ?`,
		ideaID).Scan(&count, &next); err != nil {
		return IdeaImage{}, fmt.Errorf("count idea images: %w", err)
	}
	if count >= MaxIdeaImages {
		return IdeaImage{}, ErrIdeaImageLimit
	}

	sum := sha256.Sum256(jpeg)
	img := IdeaImage{ID: imageID, Hash: hex.EncodeToString(sum[:8]), Position: next}
	hlc := s.hlc.Next()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO idea_images (id, trip_id, idea_id, image_hash, position, updated_hlc)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		img.ID, tripID, ideaID, img.Hash, img.Position, string(hlc)); err != nil {
		return IdeaImage{}, fmt.Errorf("insert idea image: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO idea_image_bytes (image_id, image) VALUES (?, ?)`, img.ID, jpeg); err != nil {
		return IdeaImage{}, fmt.Errorf("store idea image bytes: %w", err)
	}
	if _, err := appendChangeLog(ctx, tx, tripFeed(tripID),
		sync.Mutation{Table: TableIdeaImages, ID: img.ID, HLC: hlc}, false); err != nil {
		return IdeaImage{}, fmt.Errorf("log idea image: %w", err)
	}
	if err := recordActivity(ctx, tx, s.nowMillis(), activityWrite{
		feed: tripFeed(tripID), actorID: userID, table: TableIdeaImages, id: img.ID,
		applied: map[string]any{columnTripID: tripID, "idea_id": ideaID, columnImageHash: img.Hash, columnPosition: img.Position},
	}); err != nil {
		return IdeaImage{}, err
	}
	if err := tx.Commit(); err != nil {
		return IdeaImage{}, fmt.Errorf("commit idea image tx: %w", err)
	}
	return img, nil
}

// GetIdeaImage returns one picture's bytes and hash, or (nil, "", nil) when
// the trip's idea holds no such picture — a picture of another trip reads as
// missing, since the caller's membership was checked against this one.
func (s *Store) GetIdeaImage(ctx context.Context, tripID, ideaID, imageID string) ([]byte, string, error) {
	var image []byte
	var hash string
	err := s.db.QueryRowContext(ctx,
		`SELECT b.image, i.image_hash FROM idea_image_bytes b
		 JOIN idea_images i ON i.id = b.image_id
		 WHERE b.image_id = ? AND i.idea_id = ? AND i.trip_id = ?`, imageID, ideaID, tripID).Scan(&image, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", fmt.Errorf("get idea image: %w", err)
	}
	return image, hash, nil
}
