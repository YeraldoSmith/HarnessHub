export class SourceFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message)
    this.name = 'SourceFetchError'
  }
}

function retryAfterMilliseconds(response: Response): number | null {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  }
  if (response.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    if (Number.isFinite(reset)) return Math.max(0, reset * 1000 - Date.now())
  }
  return null
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
    throw new SourceFetchError(
      `Source request failed with status ${response.status}.`,
      response.status,
      url,
      retryAfterMilliseconds(response),
    )
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
    throw new SourceFetchError(
      `Source request failed with status ${response.status}.`,
      response.status,
      url,
      retryAfterMilliseconds(response),
    )
  }

  return response.text()
}
