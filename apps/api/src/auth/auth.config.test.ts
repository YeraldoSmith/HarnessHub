import { afterEach, describe, expect, it } from 'vitest'

import { AuthConfig } from './auth.config.js'

const variableNames = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_CALLBACK_URL',
  'SESSION_SECRET',
  'AUTH_WEB_SUCCESS_URL',
] as const
const originalValues = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]))

afterEach(() => {
  for (const name of variableNames) {
    const value = originalValues[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe.sequential('AuthConfig provider availability', () => {
  it('reports GitHub sign-in as unavailable without exposing a configuration error', () => {
    for (const name of variableNames) delete process.env[name]

    expect(new AuthConfig().githubAvailable()).toBe(false)
  })

  it('reports GitHub sign-in as available only with a complete safe configuration', () => {
    process.env.GITHUB_CLIENT_ID = 'client-id'
    process.env.GITHUB_CLIENT_SECRET = 'client-secret'
    process.env.GITHUB_CALLBACK_URL = 'http://127.0.0.1:3001/auth/github/callback'
    process.env.SESSION_SECRET = 'a-secure-session-secret-with-more-than-32-bytes'
    process.env.AUTH_WEB_SUCCESS_URL = 'http://127.0.0.1:5173/?auth=success'

    expect(new AuthConfig().githubAvailable()).toBe(true)
  })
})
