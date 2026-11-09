import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashState, newState, pkcePair, redirectUriFor, statesMatch } from '../../server/lib/oauth'

describe('state', () => {
  it('is random, URL-safe and stored only as a hash', () => {
    const a = newState()
    const b = newState()
    expect(a.state).not.toBe(b.state)
    expect(a.state).toMatch(/^[\w-]{43}$/) // 32 bytes, base64url
    expect(a.stateHash).toBe(hashState(a.state))
    expect(a.stateHash).not.toContain(a.state)
  })

  it('matches only the identical value from the cookie', () => {
    const { state } = newState()
    expect(statesMatch(state, state)).toBe(true)
    expect(statesMatch(state, `${state}x`)).toBe(false)
    expect(statesMatch(state, newState().state)).toBe(false)
    expect(statesMatch(state, undefined)).toBe(false)
    expect(statesMatch(undefined, state)).toBe(false)
  })
})

describe('pkcePair', () => {
  it('derives the S256 challenge from the verifier', () => {
    const { verifier, challenge } = pkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })

  it('matches the RFC 7636 appendix B example', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('redirectUriFor', () => {
  it('is fixed per provider and ignores a trailing slash', () => {
    expect(redirectUriFor('https://opshub.example/', 'slack')).toBe('https://opshub.example/api/oauth/slack/callback')
    expect(redirectUriFor('https://opshub.example', 'slack')).toBe('https://opshub.example/api/oauth/slack/callback')
  })
})
