package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"jitpack/internal/sync"
)

// maxItemImageBytes is the FR-22.4 hard cap: 150 KB. Mirrored by the
// item_images CHECK constraint (migration 012) and the HTTP handler.
const maxItemImageBytes = 150 * 1024

var (
	// ErrItemImageTooLarge is returned when an item image exceeds the
	// 150 KB cap of FR-22.4.
	ErrItemImageTooLarge = errors.New("item image exceeds 150 KB limit")
	// ErrItemNotFound is returned when an image operation targets an item
	// that does not exist.
	ErrItemNotFound = errors.New("item not found")
)

// SetItemImage stores (or replaces) an item's reference photo (Addendum
// FR-22.1/FR-22.5) and stamps items.image_hash so the change reaches
// other devices through the ordinary master-partition pull. The BLOB
// itself stays out of the sync envelope (ADR-002). Returns the stored
// hash, which the caller echoes back as the GET ETag.
func (s *Store) SetItemImage(ctx context.Context, itemID string, jpeg []byte) (string, error) {
	if len(jpeg) > maxItemImageBytes {
		return "", ErrItemImageTooLarge
	}
	sum := sha256.Sum256(jpeg)
	hash := hex.EncodeToString(sum[:8])

	err := s.withImageTx(ctx, itemID, hash, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO item_images (item_id, image, mime, updated_at)
			 VALUES (?, ?, 'image/jpeg', ?)
			 ON CONFLICT(item_id) DO UPDATE
			   SET image = excluded.image, mime = 'image/jpeg', updated_at = excluded.updated_at`,
			itemID, jpeg, time.Now().UTC().Format(time.RFC3339)); err != nil {
			return fmt.Errorf("upsert item image: %w", err)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return hash, nil
}

// DeleteItemImage removes an item's photo (FR-22.5) and nulls
// items.image_hash, stamping the clear through the change feed. It is a
// no-op-safe idempotent operation: removing a photo that isn't there
// still succeeds (and still re-stamps the already-null hash).
func (s *Store) DeleteItemImage(ctx context.Context, itemID string) error {
	return s.withImageTx(ctx, itemID, "", func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `DELETE FROM item_images WHERE item_id = ?`, itemID); err != nil {
			return fmt.Errorf("delete item image: %w", err)
		}
		return nil
	})
}

// withImageTx stamps items.image_hash to hash (empty ⇒ SQL NULL) for the
// given item, runs the caller's BLOB mutation in the same transaction,
// and appends a fresh server-HLC change_log entry so other devices pull
// the hash change. A missing item yields ErrItemNotFound.
func (s *Store) withImageTx(ctx context.Context, itemID, hash string, blobOp func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin item image tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit

	hlc := s.hlc.Next()
	var stored any
	if hash != "" {
		stored = hash
	}
	res, err := tx.ExecContext(ctx,
		`UPDATE items SET image_hash = ?, updated_hlc = ? WHERE id = ?`,
		stored, string(hlc), itemID)
	if err != nil {
		return fmt.Errorf("stamp image_hash: %w", err)
	}
	if n, err := res.RowsAffected(); err != nil {
		return fmt.Errorf("image_hash rows affected: %w", err)
	} else if n == 0 {
		return ErrItemNotFound
	}

	if err := blobOp(tx); err != nil {
		return err
	}

	if _, err := appendChangeLog(ctx, tx, nil,
		sync.Mutation{Table: "items", ID: itemID, HLC: hlc}, false); err != nil {
		return fmt.Errorf("log image_hash change: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit item image tx: %w", err)
	}
	return nil
}

// GetItemImage returns an item's stored photo bytes and its hash, or
// (nil, "", nil) when the item has no photo (FR-22.1). A missing item is
// indistinguishable from a photo-less one here — the read path has no
// reason to care.
func (s *Store) GetItemImage(ctx context.Context, itemID string) ([]byte, string, error) {
	var image []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT image FROM item_images WHERE item_id = ?`, itemID).Scan(&image)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", fmt.Errorf("get item image: %w", err)
	}
	sum := sha256.Sum256(image)
	return image, hex.EncodeToString(sum[:8]), nil
}
