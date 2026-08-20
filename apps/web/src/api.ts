import {
  pluginSchema,
  pluginSnapshotListSchema,
  registryResponseSchema,
  authSessionResponseSchema,
} from '@harnesshub/plugin-schema'
import type {
  AuthSessionResponse,
  Plugin,
  PluginSnapshotRecord,
  RegistryResponse,
} from '@harnesshub/types'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')

async function request(path: string): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`Registry request failed with status ${response.status}.`)
  }

  return response.json()
}

export const githubLoginUrl = `${apiUrl}/auth/github`

export async function getAuthSession(): Promise<AuthSessionResponse> {
  return authSessionResponseSchema.parse(await request('/auth/session'))
}

export async function logout(): Promise<void> {
  const response = await fetch(`${apiUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Logout failed with status ${response.status}.`)
}

export async function listPlugins(query = '', page = 1, limit = 20): Promise<RegistryResponse> {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (query.trim()) search.set('q', query.trim())
  return registryResponseSchema.parse(await request(`/plugins?${search.toString()}`))
}

export async function getPlugin(id: string): Promise<Plugin> {
  return pluginSchema.parse(await request(`/plugins/${encodeURIComponent(id)}`))
}

export async function listPluginSnapshots(id: string): Promise<PluginSnapshotRecord[]> {
  return pluginSnapshotListSchema.parse(
    await request(`/plugins/${encodeURIComponent(id)}/snapshots`),
  )
}
