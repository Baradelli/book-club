import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { required } from '../../test-support/builders';
import { PrismaClubRepository } from '../prisma-club-repository';
import { prisma, removeFixtures, testId } from './_db';

const CLUB_ID = testId('club');
const UPSERT_CLUB_ID = testId('club-upsert');
const ARCHIVED_CLUB_ID = testId('club-archived');

describe('PrismaClubRepository (contract)', () => {
  const repo = new PrismaClubRepository(prisma);

  beforeAll(async () => {
    await removeFixtures({
      clubIds: [CLUB_ID, UPSERT_CLUB_ID, ARCHIVED_CLUB_ID],
    });
  });

  afterAll(async () => {
    await removeFixtures({
      clubIds: [CLUB_ID, UPSERT_CLUB_ID, ARCHIVED_CLUB_ID],
    });
    await prisma.$disconnect();
  });

  it('saves a club and reads it back with the fields mapped', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    const saved = await repo.save({
      id: CLUB_ID,
      name: 'Clube do Casal',
      timezone: 'America/Sao_Paulo',
      status: 'ACTIVE',
      archivedAt: null,
      createdAt,
    });

    expect(saved.id).toBe(CLUB_ID);

    const read = required(await repo.byId(CLUB_ID));
    expect(read.name).toBe('Clube do Casal');
    expect(read.timezone).toBe('America/Sao_Paulo');
    expect(read.status).toBe('ACTIVE');
    expect(read.archivedAt).toBeNull();
    expect(read.createdAt).toBeInstanceOf(Date);
    expect(read.createdAt).toEqual(createdAt);
  });

  it('upserts by id: saving the same id updates in place and does not duplicate', async () => {
    const base = {
      id: UPSERT_CLUB_ID,
      name: 'Nome Antigo',
      timezone: 'America/Sao_Paulo',
      status: 'ACTIVE' as const,
      archivedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    await repo.save(base);

    await repo.save({ ...base, name: 'Nome Novo', timezone: 'Europe/Lisbon' });

    const read = required(await repo.byId(UPSERT_CLUB_ID));
    expect(read.name).toBe('Nome Novo');
    expect(read.timezone).toBe('Europe/Lisbon');
    await expect(
      prisma.club.count({ where: { id: UPSERT_CLUB_ID } }),
    ).resolves.toBe(1);
  });

  // Soft delete: o repositório persiste status + archivedAt como qualquer campo.
  it('round-trips an archived club with its archivedAt', async () => {
    const archivedAt = new Date('2026-02-01T00:00:00.000Z');

    await repo.save({
      id: ARCHIVED_CLUB_ID,
      name: 'Clube Arquivado',
      timezone: 'America/Sao_Paulo',
      status: 'ARCHIVED',
      archivedAt,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const read = required(await repo.byId(ARCHIVED_CLUB_ID));
    expect(read.status).toBe('ARCHIVED');
    expect(read.archivedAt).toEqual(archivedAt);
  });

  it('returns null for an id that does not exist', async () => {
    await expect(repo.byId(testId('ghost'))).resolves.toBeNull();
  });
});
