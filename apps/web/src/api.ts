import { registryResponseSchema } from '@harnesshub/plugin-schema'
import type { Plugin, RegistryResponse } from '@harnesshub/types'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')

async function request(path: string): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Registry request failed with status ${response.status}.`)
  }

  return response.json()
}

export async function listPlugins(query = ''): Promise<RegistryResponse> {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
  return registryResponseSchema.parse(await request(`/plugins${search}`))
}

export async function getPlugin(id: string): Promise<Plugin> {
  const result = await request(`/plugins/${encodeURIComponent(id)}`)
  const envelope = registryResponseSchema.safeParse({ data: [result], total: 1 })

  if (!envelope.success) {
    throw new Error('The registry returned an invalid plugin record.')
  }

  const plugin = envelope.data.data[0]
  if (!plugin) {
    throw new Error('The registry did not return a plugin record.')
  }

  return plugin
}
