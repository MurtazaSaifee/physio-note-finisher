import { prisma } from "../../data/prismaClient.js";
import type {
  AuthUserRecord,
  RefreshTokenRecord,
} from "../../api/routes/auth.js";
import type { AuthRepository } from "./authRepository.js";

function toAuthUserRecord(
  user: {
    id: string;
    clinicId: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
    dataHandlingAcknowledgementVersion: string | null;
    dataHandlingAcknowledgedAt: Date | null;
    passwordHash: string;
    tokenVersion: number;
    audioRetentionPeriod?: string | null;
  },
): AuthUserRecord {
  const record: AuthUserRecord = {
    id: user.id,
    clinicId: user.clinicId,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    firstName: user.firstName,
    lastName: user.lastName,
    passwordHash: user.passwordHash,
    tokenVersion: user.tokenVersion,
    emailVerified: user.emailVerified,
    ...(user.dataHandlingAcknowledgementVersion
      ? { dataHandlingAcknowledgementVersion: user.dataHandlingAcknowledgementVersion }
      : {}),
    ...(user.dataHandlingAcknowledgedAt
      ? { dataHandlingAcknowledgedAt: user.dataHandlingAcknowledgedAt }
      : {}),
  };
  if (user.audioRetentionPeriod) {
    record.audioRetentionPeriod = user.audioRetentionPeriod;
  }
  return record;
}

function toRefreshTokenRecord(rt: {
  tokenHash: string;
  userId: string;
  clinicId: string;
  sessionId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByToken?: { tokenHash: string } | null;
}): RefreshTokenRecord {
  return {
    tokenHash: rt.tokenHash,
    userId: rt.userId,
    clinicId: rt.clinicId,
    sessionId: rt.sessionId,
    tokenVersion: 0,
    expiresAt: rt.expiresAt,
    revokedAt: rt.revokedAt,
    replacedByTokenHash: rt.replacedByToken?.tokenHash ?? null,
  };
}

export class PrismaAuthRepository implements AuthRepository {
  async findUserByEmail(email: string): Promise<AuthUserRecord | undefined> {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ? toAuthUserRecord(user) : undefined;
  }

  async findUserById(id: string): Promise<AuthUserRecord | undefined> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? toAuthUserRecord(user) : undefined;
  }

  async createUser(user: AuthUserRecord): Promise<void> {
    await prisma.user.create({
      data: {
        id: user.id,
        clinicId: user.clinicId,
        email: user.email,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        emailVerified: user.emailVerified ?? false,
        dataHandlingAcknowledgementVersion:
          user.dataHandlingAcknowledgementVersion ?? null,
        dataHandlingAcknowledgedAt: user.dataHandlingAcknowledgedAt ?? null,
        passwordHash: user.passwordHash,
        tokenVersion: user.tokenVersion,
        audioRetentionPeriod: user.audioRetentionPeriod ?? "30d",
      },
    });
  }

  async saveUser(user: AuthUserRecord): Promise<void> {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.email,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        emailVerified: user.emailVerified ?? false,
        dataHandlingAcknowledgementVersion:
          user.dataHandlingAcknowledgementVersion ?? null,
        dataHandlingAcknowledgedAt: user.dataHandlingAcknowledgedAt ?? null,
        passwordHash: user.passwordHash,
        tokenVersion: user.tokenVersion,
        audioRetentionPeriod: user.audioRetentionPeriod ?? "30d",
      },
    });
  }

  async findRefreshTokenByHash(
    hash: string,
  ): Promise<RefreshTokenRecord | undefined> {
    const rt = await prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: {
        replacedByToken: {
          select: { tokenHash: true },
        },
      },
    });
    return rt ? toRefreshTokenRecord(rt) : undefined;
  }

  async createRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await prisma.refreshToken.create({
      data: {
        tokenHash: record.tokenHash,
        userId: record.userId,
        clinicId: record.clinicId,
        sessionId: record.sessionId,
        expiresAt: record.expiresAt,
        revokedAt: record.revokedAt,
      },
    });
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await prisma.refreshToken.update({
      where: { tokenHash: record.tokenHash },
      data: {
        revokedAt: record.revokedAt,
      },
    });
  }

  async consumeRefreshTokenAndCreateSuccessor(input: {
    currentTokenHash: string;
    nextRecord: RefreshTokenRecord;
    revokedAt: Date;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: {
          tokenHash: input.currentTokenHash,
          revokedAt: null,
          expiresAt: { gt: input.revokedAt },
        },
        data: { revokedAt: input.revokedAt },
      });
      if (consumed.count !== 1) {
        return false;
      }

      const successor = await tx.refreshToken.create({
        data: {
          tokenHash: input.nextRecord.tokenHash,
          userId: input.nextRecord.userId,
          clinicId: input.nextRecord.clinicId,
          sessionId: input.nextRecord.sessionId,
          expiresAt: input.nextRecord.expiresAt,
          revokedAt: input.nextRecord.revokedAt,
        },
      });

      await tx.refreshToken.update({
        where: { tokenHash: input.currentTokenHash },
        data: { replacedByTokenId: successor.id },
      });
      return true;
    });
  }

  async listRefreshTokensByUser(
    userId: string,
  ): Promise<RefreshTokenRecord[]> {
    const records = await prisma.refreshToken.findMany({
      where: { userId },
      include: {
        replacedByToken: {
          select: { tokenHash: true },
        },
      },
    });
    return records.map(toRefreshTokenRecord);
  }
}
