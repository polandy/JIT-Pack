/**
 * Who the instance knows about: the own profile (M17), the user directory,
 * and the admin surface that changes both (Addendum 3.23, M20).
 *
 * Plain REST, admin-gated server-side; nothing here touches the sync
 * partitions — `users` is outside both. They are one group rather than two
 * because they share the rule at the bottom of this file: a writer that
 * changes who the instance knows about is the thing that refetches it.
 */
import { API } from '@/api/routes'

import type {
  AdminUserListResponse,
  APITokenExpiry,
  APITokenResponse,
  DirectoryUser,
  MeResponse,
  UserListResponse,
} from '@/api/types'
import type { AdminUserRow } from '@/domain/admin'
import type { IdentitySource } from '@/stores/identityStore'
import type { RestClient } from './restClient'

/**
 * The session-wide identity answer these writers invalidate. The pinia
 * identity store satisfies it (ADR-047); it is named here so this group can
 * be built and driven without one.
 */
export interface IdentityCache {
  refresh(source: IdentitySource): Promise<void>
}

export interface IdentityDeps {
  client: RestClient
  /**
   * Read lazily, because the pinia store behind it in the app does not exist
   * until a pinia is active.
   */
  identityCache: () => IdentityCache
}

export interface IdentityActions {
  /**
   * The own identity; null in Local Mode (no server).
   * `is_instance_admin` gates the M20 entry point (FR-23.2).
   */
  fetchMe(): Promise<MeResponse | null>
  /**
   * The instance's user directory for the M3 sharing picker (FR-4.5); empty
   * offline or in Local Mode (no accounts).
   */
  fetchUsers(): Promise<DirectoryUser[]>
  fetchAdminUsers(): Promise<AdminUserRow[]>
  deactivateUser(userID: string): Promise<void>
  reactivateUser(userID: string): Promise<void>
  adminResetAvatar(userID: string): Promise<void>
  adminResetDisplayName(userID: string): Promise<void>
  /**
   * Mint an API token (FR-23.7). The response is the only time the token is
   * ever readable, so it is handed straight to the caller and kept nowhere:
   * this must not reach localStorage or any store.
   */
  createAPIToken(name: string, expiry: APITokenExpiry): Promise<APITokenResponse | null>
  saveDisplayName(userId: string, name: string): Promise<void>
  uploadAvatar(userId: string, jpeg: Blob): Promise<void>
  /** Fetch an NFR-4.5 export with the auth header. */
  downloadExport(path: string): Promise<Blob | null>
}

/** Local Mode's answer: no accounts and no admin, so nothing is read and nothing written. */
export const NO_IDENTITY_ACTIONS: IdentityActions = {
  fetchMe: async () => null,
  fetchUsers: async () => [],
  fetchAdminUsers: async () => [],
  deactivateUser: async () => {},
  reactivateUser: async () => {},
  adminResetAvatar: async () => {},
  adminResetDisplayName: async () => {},
  createAPIToken: async () => null,
  saveDisplayName: async () => {},
  uploadAvatar: async () => {},
  downloadExport: async () => null,
}

export function createIdentityActions(deps: IdentityDeps): IdentityActions {
  const { client, identityCache } = deps

  async function fetchMe(): Promise<MeResponse | null> {
    try {
      return await client.get<MeResponse>(API.me, {})
    } catch {
      return null
    }
  }

  async function fetchUsers(): Promise<DirectoryUser[]> {
    try {
      const resp = await client.get<UserListResponse>(API.users, {})
      return resp.users ?? []
    } catch {
      return []
    }
  }

  /**
   * The four writers below are the only things that change who the instance
   * knows about, so they are where the session-wide answer is fetched again
   * (ADR-047) — never the screen that happened to trigger them. A rename made
   * on M17 has to reach the name M4 puts on a packed row, and only one of
   * those two screens is mounted at the time.
   *
   * The avatar writers are deliberately not among them: the bytes are fetched
   * by URL with a cache-busting version, and the directory carries no image.
   */
  function refreshIdentity(): Promise<void> {
    return identityCache().refresh({ fetchUsers, fetchMe })
  }

  return {
    fetchMe,
    fetchUsers,

    async fetchAdminUsers() {
      const resp = await client.get<AdminUserListResponse>(API.adminUsers, {})
      return resp.users ?? []
    },

    async deactivateUser(userID) {
      await client.post(API.adminDeactivateUser(userID), {})
      await refreshIdentity()
    },

    async reactivateUser(userID) {
      await client.post(API.adminReactivateUser(userID), {})
      await refreshIdentity()
    },

    async adminResetAvatar(userID) {
      await client.delete(API.adminResetAvatar(userID))
    },

    async adminResetDisplayName(userID) {
      await client.delete(API.adminResetDisplayName(userID))
      await refreshIdentity()
    },

    async createAPIToken(name, expiry) {
      return client.post<APITokenResponse>(API.meTokens, { name, expiry })
    },

    async saveDisplayName(userId, name) {
      await client.put(API.userDisplayName(userId), { display_name: name })
      await refreshIdentity()
    },

    async uploadAvatar(userId, jpeg) {
      await client.putRaw(API.userAvatar(userId), jpeg, 'image/jpeg')
    },

    async downloadExport(path) {
      return client.getBlob(path)
    },
  }
}
