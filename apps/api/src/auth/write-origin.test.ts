import { describe, expect, it } from 'vitest'

import { assertTrustedWriteOrigin } from './write-origin.js'

describe('developer write origin protection', () => {
  it('requires an allowlisted Origin for ambient cookie sessions', () => {
    expect(() => assertTrustedWriteOrigin(undefined, 'http://127.0.0.1:5173')).not.toThrow()
    expect(() => assertTrustedWriteOrigin(undefined, undefined)).toThrow(/origin is not allowed/i)
    expect(() => assertTrustedWriteOrigin(undefined, 'https://attacker.example')).toThrow(/origin is not allowed/i)
  })

  it('allows a non-ambient desktop bearer session without an Origin header', () => {
    expect(() => assertTrustedWriteOrigin(`Bearer ${'a'.repeat(48)}`, undefined)).not.toThrow()
  })
})
