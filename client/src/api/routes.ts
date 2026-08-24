/**
 * Generated from internal/api/wire.go by cmd/wiregen. Do not edit.
 *
 * Every HTTP path this instance serves, built from the server's own declaration
 * (NFR-4.14). The shape is a rule rather than a convention (ADR-027):
 *
 * - the path names the **scope** first, then the resource;
 * - the master partition belongs to no trip, so its scope segment is the
 *   literal `master` rather than an id;
 * - an export names its **format** as the path's extension.
 */

export const API = {
  // Trip scope.
  tripSync: (tripID: string) => `/api/v1/trips/${tripID}/sync`,
  tripConflicts: (tripID: string) => `/api/v1/trips/${tripID}/conflicts`,
  tripConflictRevert: (tripID: string, conflictID: string) =>
    `/api/v1/trips/${tripID}/conflicts/${conflictID}/revert`,
  tripExportCSV: (tripID: string) => `/api/v1/trips/${tripID}/export.csv`,

  // Master scope — the partition that belongs to no trip, so its scope
  // segment is a literal rather than an id.
  masterSync: '/api/v1/master/sync',
  masterConflicts: '/api/v1/master/conflicts',
  masterConflictRevert: (conflictID: string) => `/api/v1/master/conflicts/${conflictID}/revert`,

  // The caller's own scope. The full export lives here because it is
  // filtered to what the caller may pull, and it names its format.
  me: '/api/v1/me',
  meNotificationPrefs: '/api/v1/me/notification-prefs',
  meExport: '/api/v1/me/export.json',

  // User scope.
  users: '/api/v1/users',
  userAvatar: (userID: string) => `/api/v1/users/${userID}/avatar`,
  userDisplayName: (userID: string) => `/api/v1/users/${userID}/display-name`,

  // Item scope.
  itemImage: (itemID: string) => `/api/v1/items/${itemID}/image`,

  // Notification scope.
  notifications: '/api/v1/notifications',
  notificationRead: (notificationID: string) => `/api/v1/notifications/${notificationID}/read`,

  // Web Push scope.
  pushVAPIDKey: '/api/v1/push/vapid-key',
  pushSubscriptions: '/api/v1/push/subscriptions',

  // Admin scope.
  adminUsers: '/api/v1/admin/users',
  adminDeactivateUser: (userID: string) => `/api/v1/admin/users/${userID}/deactivate`,
  adminReactivateUser: (userID: string) => `/api/v1/admin/users/${userID}/reactivate`,
  adminResetAvatar: (userID: string) => `/api/v1/admin/users/${userID}/avatar`,
  adminResetDisplayName: (userID: string) => `/api/v1/admin/users/${userID}/display-name`,

  // Instance scope: no caller, no partition.
  authToken: '/api/v1/auth/token',
  authRefresh: '/api/v1/auth/refresh',
  authConfig: '/api/v1/auth/config',
  config: '/api/v1/config',

  // Outside the versioned surface on purpose: the socket carries the
  // versioned frame in its payload, and a health probe is not an API.
  ws: '/ws',
  health: '/health',
} as const
