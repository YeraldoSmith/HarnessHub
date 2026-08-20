export class SourceFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message)
    this.name = 'SourceFetchError'
  }
}

export async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new SourceFetchError(`Source request failed with status ${response.status}.`, response.status, url)
  }

  return (await response.json()) as T
}

export async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new SourceFetchError(`Source request failed with status ${response.status}.`, response.status, url)
  }

  return response.text()
}
