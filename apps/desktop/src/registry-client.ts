import { registryResponseSchema } from '@harnesshub/plugin-schema'
import type { RegistryResponse } from '@harnesshub/types'

import bundledRegistryJson from './registry-snapshot.json'

export type RegistryLoadSource = 'LIVE' | 'BUNDLED'

export interface RegistryLoadResult {
  registry: RegistryResponse
  source: RegistryLoadSource
}

type RegistryFetcher = (path: string, init?: RequestInit) => Promise<Response>

export class DesktopApiUnavailableError extends Error {
  constructor() {
    super('HarnessHub API is unavailable.')
    this.name = 'DesktopApiUnavailableError'
  }
}

const configuredApiUrl = import.meta.env.VITE_HARNESSHUB_API_URL?.trim()

export const desktopApiUrl = configuredApiUrl || 'http://127.0.0.1:3001'
export const bundledRegistry = registryResponseSchema.parse(bundledRegistryJson)

export async function fetchDesktopApi(
  path: string,
  init?: RequestInit,
  timeoutMilliseconds = 5000,
  apiBaseUrl = desktopApiUrl,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMilliseconds)
  try {
    return await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, { ...init, signal: controller.signal })
  } catch {
    throw new DesktopApiUnavailableError()
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function loadDesktopRegistry(
  fetcher?: RegistryFetcher,
  apiBaseUrl = desktopApiUrl,
): Promise<RegistryLoadResult> {
  const selectedFetcher = fetcher ?? ((path, init) => fetchDesktopApi(path, init, 5000, apiBaseUrl))
  try {
    const response = await selectedFetcher('/plugins?limit=100&sort=name', {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Registry status ${response.status}`)
    return {
      registry: registryResponseSchema.parse(await response.json()),
      source: 'LIVE',
    }
  } catch {
    return { registry: bundledRegistry, source: 'BUNDLED' }
  }
}
