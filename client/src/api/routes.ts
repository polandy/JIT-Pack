/**
 * Every HTTP path the client calls, named once (CODING_PRINCIPLES §4a).
 *
 * The shape is a rule rather than a convention (NFR-4.14, ADR-027):
 *
 * - the path names the **scope** first, then the resource — `/trips/{id}/…`,
 *   `/master/…`, `/me/…`, `/users/{id}/…`, `/items/{id}/…`;
 * - the master partition belongs to no trip, so its scope segment is the
 *   literal `master` rather than an id;
 * - an export names its **format** as the path's extension.
 *
 * Keeping them here is what makes the next shape change one file rather than
 * forty call sites — which is what this file's own history cost.
 */

const V1 = '/api/v1'

export const API = {
  // Trip scope.
  tripSync: (tripId: string) => `${V1}/trips/${tripId}/sync`,
  tripConflicts: (tripId: string) => `${V1}/trips/${tripId}/conflicts`,
  tripConflictRevert: (tripId: string, conflictId: string) =>
    `${V1}/trips/${tripId}/conflicts/${conflictId}/revert`,
  tripTakeover: (tripId: string, itemId: string) =>
    `${V1}/trips/${tripId}/items/${itemId}/takeover`,
  tripLockEvents: (tripId: string) => `${V1}/trips/${tripId}/lock-events`,
  tripExportCsv: (tripId: string) => `${V1}/trips/${tripId}/export.csv`,

  // Master scope.
  masterSync: `${V1}/master/sync`,
  masterConflicts: `${V1}/master/conflicts`,
  masterConflictRevert: (conflictId: string) => `${V1}/master/conflicts/${conflictId}/revert`,

  // The caller's own scope.
  me: `${V1}/me`,
  meNotificationPrefs: `${V1}/me/notification-prefs`,
  meExport: `${V1}/me/export.json`,

  // User scope.
  users: `${V1}/users`,
  userAvatar: (userId: string) => `${V1}/users/${userId}/avatar`,
  userDisplayName: (userId: string) => `${V1}/users/${userId}/display-name`,

  // Item scope.
  itemImage: (itemId: string) => `${V1}/items/${itemId}/image`,

  // Notification scope.
  notifications: `${V1}/notifications`,
  notificationRead: (notificationId: string) => `${V1}/notifications/${notificationId}/read`,

  // Web Push scope.
  pushVapidKey: `${V1}/push/vapid-key`,
  pushSubscriptions: `${V1}/push/subscriptions`,

  // Admin scope.
  adminUsers: `${V1}/admin/users`,
  adminDeactivateUser: (userId: string) => `${V1}/admin/users/${userId}/deactivate`,
  adminReactivateUser: (userId: string) => `${V1}/admin/users/${userId}/reactivate`,
  adminResetAvatar: (userId: string) => `${V1}/admin/users/${userId}/avatar`,
  adminResetDisplayName: (userId: string) => `${V1}/admin/users/${userId}/display-name`,

  // Instance scope.
  authToken: `${V1}/auth/token`,
  authRefresh: `${V1}/auth/refresh`,
  authConfig: `${V1}/auth/config`,
} as const
