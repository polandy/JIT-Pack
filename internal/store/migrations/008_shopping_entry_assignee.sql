-- 008 — FR-30.12: a shopping entry may be handed to somebody to buy.
--
-- A nullable column: every entry written before it is nobody's in
-- particular, which is what NULL means. The comment explaining the shape
-- lives in schema.sql (ADR-067 driver 4).

ALTER TABLE shopping_entries ADD COLUMN assignee_user_id TEXT REFERENCES users(id);
