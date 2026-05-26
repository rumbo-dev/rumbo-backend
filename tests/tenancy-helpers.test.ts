/**
 * Tests del helper de tenancy. NO requieren BD — testean la lógica de
 * inyección de organizationId en where/data y la detección defensiva
 * de tenancy violations.
 */
import { describe, expect, it } from 'vitest'
import { injectData, injectWhere, isTenantModel } from '../src/lib/tenancy.js'

const ORG_A = 'org_AAA'
const ORG_B = 'org_BBB'

describe('isTenantModel', () => {
  it('reconoce los modelos tenant-scoped', () => {
    expect(isTenantModel('Operation')).toBe(true)
    expect(isTenantModel('Task')).toBe(true)
    expect(isTenantModel('Quote')).toBe(true)
    expect(isTenantModel('Contract')).toBe(true)
    expect(isTenantModel('AgentDecision')).toBe(true)
    expect(isTenantModel('EmailDraft')).toBe(true)
    expect(isTenantModel('EmailInbound')).toBe(true)
    expect(isTenantModel('JourneyStep')).toBe(true)
    expect(isTenantModel('TimelineEvent')).toBe(true)
  })

  it('NO reclama models que no son tenant-scoped', () => {
    expect(isTenantModel('User')).toBe(false)
    expect(isTenantModel('Organization')).toBe(false)
    expect(isTenantModel('Membership')).toBe(false)
  })

  it('soporta lowercase y devuelve false con undefined', () => {
    expect(isTenantModel('operation')).toBe(true)
    expect(isTenantModel(undefined)).toBe(false)
    expect(isTenantModel('')).toBe(false)
  })
})

describe('injectWhere', () => {
  it('agrega organizationId a un where vacío', () => {
    const result = injectWhere({}, ORG_A)
    expect(result.where).toEqual({ organizationId: ORG_A })
  })

  it('agrega organizationId preservando otros filtros', () => {
    const result = injectWhere(
      { where: { status: 'IN_TRANSIT' } },
      ORG_A,
    )
    expect(result.where).toEqual({ status: 'IN_TRANSIT', organizationId: ORG_A })
  })

  it('acepta args sin la propiedad where', () => {
    const result = injectWhere({ orderBy: { createdAt: 'desc' } }, ORG_A)
    expect(result.where).toEqual({ organizationId: ORG_A })
    expect(result.orderBy).toEqual({ createdAt: 'desc' })
  })

  it('detecta tenancy violation cuando el caller intenta otra org', () => {
    expect(() => injectWhere({ where: { organizationId: ORG_B } }, ORG_A)).toThrow(
      /Tenancy violation/,
    )
  })

  it('pasa si el caller ya puso la misma org', () => {
    const result = injectWhere({ where: { organizationId: ORG_A } }, ORG_A)
    expect(result.where).toEqual({ organizationId: ORG_A })
  })
})

describe('injectData', () => {
  it('agrega organizationId a un create simple', () => {
    const result = injectData({ data: { clientName: 'X' } }, ORG_A)
    expect(result.data).toEqual({ clientName: 'X', organizationId: ORG_A })
  })

  it('agrega organizationId a cada row en createMany', () => {
    const result = injectData(
      { data: [{ clientName: 'X' }, { clientName: 'Y' }] },
      ORG_A,
    )
    expect(result.data).toEqual([
      { organizationId: ORG_A, clientName: 'X' },
      { organizationId: ORG_A, clientName: 'Y' },
    ])
  })

  it('throws si data ya trae otra org (defensa contra bypass)', () => {
    expect(() => injectData({ data: { organizationId: ORG_B } }, ORG_A)).toThrow(
      /Tenancy violation/,
    )
  })
})
