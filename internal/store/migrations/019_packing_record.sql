-- 019: Split the packing record from the assignment (FR-25.19)
--
-- packer_user_id was doing two jobs: the M5 control labelled "Gepackt
-- von" *assigned* the row, while the FR-25.3 avatar and the FR-25.17
-- stamp read the same field as the record of who packed it. Delegating
-- to Sia and then packing it yourself made the app claim Sia packed it.
--
-- From here: packer_user_id is the assignment ("Zugewiesen an", chosen
-- deliberately, triggers the FR-6.2 push); packed_by_user_id is the
-- record, written from the acting user when the row is checked and
-- cleared when it is un-packed. The old name stays because renaming an
-- applied column costs a rebuild and buys nothing.

ALTER TABLE trip_items ADD COLUMN packed_by_user_id TEXT REFERENCES users(id);

-- Before this migration the packer column *was* the record, so packed
-- rows keep their FR-25.17 stamp. Copy, never move: on those rows the
-- person was also the responsible one. Unpacked rows get nothing — a
-- record invented for them would claim work that never happened.
UPDATE trip_items SET packed_by_user_id = packer_user_id
WHERE state = 'packed' AND packer_user_id IS NOT NULL;
