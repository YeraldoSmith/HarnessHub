import { describe, expect, it } from 'vitest'

import { decryptSecret, encryptSecret, pkceChallenge, randomToken, sha256 } from './auth.crypto.js'

describe('OAuth cryptography helpers', () => {
  it('creates URL-safe random values and an RFC 7636 S256 challenge', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(pkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(sha256('state')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('binds encrypted values to their intended purpose', () => {
    const secret = 'test-only-session-secret-with-more-than-32-bytes'
    const encrypted = encryptSecret('sensitive-value', secret, 'oauth-verifier:one')
    expect(encrypted).not.toContain('sensitive-value')
    expect(decryptSecret(encrypted, secret, 'oauth-verifier:one')).toBe('sensitive-value')
    expect(() => decryptSecret(encrypted, secret, 'oauth-verifier:two')).toThrow()
  })
})
