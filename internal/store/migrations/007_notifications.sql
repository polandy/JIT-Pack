-- 007: notification system (FR-6.2, UI-Spec M17).
-- Per-user event-type preferences as JSON {"delegation":bool,"mention":bool,"task":bool};
-- NULL or a missing key means the kind is enabled (opt-out model).
ALTER TABLE users ADD COLUMN notification_prefs TEXT
    CHECK (notification_prefs IS NULL OR json_valid(notification_prefs));

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
