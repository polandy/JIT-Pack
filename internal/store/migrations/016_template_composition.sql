-- 016: Template composition — scopes, group includes, position tasks (§3.27)
--
-- FR-27.1/27.6: a template is either a `group` (positions only, includable)
-- or a `template` — a Ferien-Vorlage, which includes groups and may carry own
-- positions. Deliberately two levels: that makes include cycles structurally
-- impossible, so `template_includes` needs no transitive validator. Existing
-- rows predate the scope and become Ferien-Vorlagen, which is what they were
-- used as.
--
-- No table rebuild here: the columns are added, not dropped, and SQLite
-- accepts a CHECK on ADD COLUMN as long as it has a non-NULL default.

ALTER TABLE templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'template'
    CHECK (kind IN ('group','template'));                 -- FR-27.1/27.6

-- FR-27.1: groups are included by reference, never copied — one row per
-- (Vorlage, Gruppe) pair. The scope rule (parent must be a Ferien-Vorlage,
-- child a Gruppe) is enforced in the store, where a violation becomes an
-- ordinary rejected mutation instead of an opaque trigger abort; the CHECK
-- below only covers what SQL can see on its own.
CREATE TABLE template_includes (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    template_id          TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    included_template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    updated_hlc          TEXT NOT NULL DEFAULT '',
    UNIQUE (template_id, included_template_id),
    CHECK (template_id <> included_template_id)
);

CREATE INDEX idx_template_includes_included ON template_includes (included_template_id);

-- FR-27.7: free-text preparation tasks on a position. Each one instantiates
-- as an ordinary FR-7.3 todo on the generated trip item, so the existing
-- "open prep blocks done" rule (FR-25.2) applies without a new mechanism.
-- A row per task rather than a JSON column on template_items: tasks are
-- edited independently, and field-level LWW merge (Sync-API §6) would treat
-- a JSON blob as one field and lose concurrent edits.
CREATE TABLE template_item_tasks (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    template_item_id TEXT NOT NULL REFERENCES template_items(id) ON DELETE CASCADE,
    task             TEXT NOT NULL,
    updated_hlc      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_template_item_tasks_position ON template_item_tasks (template_item_id);
