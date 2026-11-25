import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import { PrismaAuthRepository } from "../../src/domain/auth/prismaAuthRepository.js";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const createdIds: Array<{ clinicId: string; userId: string }> = [];

afterEach(async () => {
  while (createdIds.length > 0) {
    const { clinicId, userId } = createdIds.pop()!;
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.clinic.deleteMany({ where: { id: clinicId } });
  }
});

describe.runIf(hasDatabase)("PrismaAuthRepository refresh rotation PostgreSQL races", () => {
  it("creates exactly one successor when two database transactions consume one token", async () => {
    const clinicId = `refresh-race-clinic-${randomUUID()}`;
    const userId = `refresh-race-user-${randomUUID()}`;
    const currentTokenHash = `refresh-race-current-${randomUUID()}`;
    const now = new Date();
    createdIds.push({ clinicId, userId });

    await prisma.clinic.create({ data: { id: clinicId, name: "Refresh Race Clinic" } });
    await prisma.user.create({
      data: {
        id: userId,
        clinicId,
        email: `refresh-race-${randomUUID()}@example.com`,
        firstName: "Refresh",
        lastName: "Race",
        passwordHash: "not-used-by-this-test",
        emailVerified: true,
      },
    });
    await prisma.refreshToken.create({
      data: {
        tokenHash: currentTokenHash,
        userId,
        clinicId,
        sessionId: `refresh-race-session-${randomUUID()}`,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });

    const repository = new PrismaAuthRepository();
    const outcomes = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        repository.consumeRefreshTokenAndCreateSuccessor({
          currentTokenHash,
          revokedAt: now,
          nextRecord: {
            tokenHash: `refresh-race-next-${index}-${randomUUID()}`,
            userId,
            clinicId,
            sessionId: `refresh-race-next-session-${index}-${randomUUID()}`,
            tokenVersion: 0,
            expiresAt: new Date(now.getTime() + 60_000),
            revokedAt: null,
            replacedByTokenHash: null,
          },
        }),
      ),
    );

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome)).toHaveLength(1);

    const tokens = await prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { tokenHash: "asc" },
    });
    const currentToken = tokens.find((token) => token.tokenHash === currentTokenHash);
    const successors = tokens.filter((token) => token.tokenHash !== currentTokenHash);

    expect(currentToken?.revokedAt).toEqual(now);
    expect(currentToken?.replacedByTokenId).toEqual(successors[0]?.id);
    expect(successors).toHaveLength(1);
    expect(successors[0]).toMatchObject({
      userId,
      clinicId,
      revokedAt: null,
    });
  });
});
