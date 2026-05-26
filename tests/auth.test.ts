/**
 * Tests del módulo auth — fail-fast de JWT_SECRET + shape del token.
 * No requieren BD.
 */
import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { JWT_SECRET, signToken } from '../src/lib/auth.js'

describe('JWT_SECRET fail-fast', () => {
  it('JWT_SECRET está seteado (de lo contrario el import habría tirado)', () => {
    expect(JWT_SECRET).toBeTruthy()
    expect(JWT_SECRET.length).toBeGreaterThan(8)
  })
})

describe('signToken', () => {
  it('emite un JWT que se verifica con JWT_SECRET', () => {
    const token = signToken({
      userId: 'u_1',
      organizationId: 'org_1',
      membershipId: 'm_1',
    })
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(3) // header.payload.signature

    const decoded = jwt.verify(token, JWT_SECRET) as any
    expect(decoded.userId).toBe('u_1')
    expect(decoded.organizationId).toBe('org_1')
    expect(decoded.membershipId).toBe('m_1')
  })

  it('expira en 24h (no permanente)', () => {
    const token = signToken({ userId: 'u', organizationId: 'org' })
    const decoded = jwt.verify(token, JWT_SECRET) as any
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    // 24h = 86400s. Margin de tolerancia: ±5s para no flakear.
    expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(86_395)
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(86_405)
  })
})
