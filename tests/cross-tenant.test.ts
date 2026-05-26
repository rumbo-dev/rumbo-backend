/**
 * Test del helper requireOperationOwnedBy con prisma mockeado.
 * Garantiza que NUNCA hace un findFirst sin filtro de organizationId —
 * la deuda crítica que reemplaza el patrón "findUnique → comparar userId".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  emailDraftFindFirstMock: vi.fn(),
  taskFindFirstMock: vi.fn(),
}))

const { findFirstMock, emailDraftFindFirstMock, taskFindFirstMock } = mocks

vi.mock('../src/lib/prismaClient.js', () => ({
  prisma: {
    operation: { findFirst: mocks.findFirstMock },
    emailDraft: { findFirst: mocks.emailDraftFindFirstMock },
    task: { findFirst: mocks.taskFindFirstMock },
    membership: { findUnique: vi.fn(), findMany: vi.fn() },
    organization: { findFirst: vi.fn() },
  },
}))

import {
  requireOperationOwnedBy,
  requireDraftOwnedBy,
  requireTaskOwnedBy,
} from '../src/lib/auth.js'

beforeEach(() => {
  findFirstMock.mockReset()
  emailDraftFindFirstMock.mockReset()
  taskFindFirstMock.mockReset()
})

describe('requireOperationOwnedBy', () => {
  it('filtra por organizationId y operationCode cuando le pasás OP-XXXX', async () => {
    findFirstMock.mockResolvedValue({ id: 'op_1', operationCode: 'OP-0142' })
    const op = await requireOperationOwnedBy('org_A', 'OP-0142')
    expect(op).not.toBeNull()
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { operationCode: 'OP-0142', organizationId: 'org_A' },
    })
  })

  it('filtra por organizationId y id cuando le pasás un UUID', async () => {
    findFirstMock.mockResolvedValue({ id: 'op_xyz' })
    await requireOperationOwnedBy('org_A', 'op_xyz')
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: 'op_xyz', organizationId: 'org_A' },
    })
  })

  it('devuelve null cuando la op pertenece a otra org (cross-tenant)', async () => {
    // Prisma simula: la op no existe en org_B → findFirst devuelve null.
    findFirstMock.mockResolvedValue(null)
    const op = await requireOperationOwnedBy('org_B', 'OP-0142')
    expect(op).toBeNull()
  })
})

describe('requireDraftOwnedBy', () => {
  it('filtra por organizationId en el draft', async () => {
    emailDraftFindFirstMock.mockResolvedValue({ id: 'd_1' })
    await requireDraftOwnedBy('org_A', 'd_1')
    expect(emailDraftFindFirstMock).toHaveBeenCalledWith({
      where: { id: 'd_1', organizationId: 'org_A' },
      include: { operation: true },
    })
  })
})

describe('requireTaskOwnedBy', () => {
  it('filtra por organizationId en la task', async () => {
    taskFindFirstMock.mockResolvedValue({ id: 't_1' })
    await requireTaskOwnedBy('org_A', 't_1')
    expect(taskFindFirstMock).toHaveBeenCalledWith({
      where: { id: 't_1', organizationId: 'org_A' },
      include: { operation: true },
    })
  })
})
