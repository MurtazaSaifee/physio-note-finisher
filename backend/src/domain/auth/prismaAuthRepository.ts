import { prisma } from "../../data/prismaClient.js";
import type {
  AuthUserRecord,
  OtpStateRecord,
  RefreshTokenRecord,
} from "../../api/routes/auth.js";
import type {
  AuthRepository,
  OtpInvalidAttemptOutcome,
  OtpResendReservation,
  OtpValidConsumeOutcome,
} from "./authRepository.js";

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

function toOtpStateRecord(otp: {
  id: string;
  userId: string;
  clinicId: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  resends: number;
  lastSentAt: Date;
}): OtpStateRecord {
  return {
    id: otp.id,
    userId: otp.userId,
    clinicId: otp.clinicId,
    email: otp.email,
    codeHash: otp.codeHash,
    expiresAt: otp.expiresAt,
    attempts: otp.attempts,
    resends: otp.resends,
    lastSentAt: otp.lastSentAt,
  };
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

  async createSignupSession(input: {
    clinic: { id: string; name: string };
    user: AuthUserRecord;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.clinic.create({
        data: {
          id: input.clinic.id,
          name: input.clinic.name,
        },
      });

      await tx.user.create({
        data: {
          id: input.user.id,
          clinicId: input.user.clinicId,
          email: input.user.email,
          firstName: input.user.firstName ?? "",
          lastName: input.user.lastName ?? "",
          emailVerified: input.user.emailVerified ?? false,
          dataHandlingAcknowledgementVersion:
            input.user.dataHandlingAcknowledgementVersion ?? null,
          dataHandlingAcknowledgedAt:
            input.user.dataHandlingAcknowledgedAt ?? null,
          passwordHash: input.user.passwordHash,
          tokenVersion: input.user.tokenVersion,
          audioRetentionPeriod: input.user.audioRetentionPeriod ?? "30d",
        },
      });
    });
  }

  async findOtpStateByUserId(
    userId: string,
  ): Promise<OtpStateRecord | undefined> {
    const otp = await prisma.otpState.findFirst({
      where: { userId },
    });
    return otp ? toOtpStateRecord(otp) : undefined;
  }

  async saveOtpState(state: OtpStateRecord): Promise<void> {
    await prisma.otpState.upsert({
      where: {
        userId_clinicId: { userId: state.userId, clinicId: state.clinicId },
      },
      create: {
        id: state.id,
        userId: state.userId,
        clinicId: state.clinicId,
        email: state.email,
        codeHash: state.codeHash,
        expiresAt: state.expiresAt,
        attempts: state.attempts,
        resends: state.resends,
        lastSentAt: state.lastSentAt,
      },
      update: {
        email: state.email,
        codeHash: state.codeHash,
        expiresAt: state.expiresAt,
        attempts: state.attempts,
        resends: state.resends,
        lastSentAt: state.lastSentAt,
      },
    });
  }

  async consumeValidOtp(input: {
    id: string;
    userId: string;
    clinicId: string;
    codeHash: string;
  }): Promise<OtpValidConsumeOutcome> {
    const deleted = await prisma.otpState.deleteMany({
      where: {
        id: input.id,
        userId: input.userId,
        clinicId: input.clinicId,
        codeHash: input.codeHash,
      },
    });
    return deleted.count === 1 ? { status: "consumed" } : { status: "missing" };
  }

  async consumeInvalidOtpAttempt(input: {
    userId: string;
    clinicId: string;
    maxAttempts: number;
  }): Promise<OtpInvalidAttemptOutcome> {
    const incremented = await prisma.otpState.updateMany({
      where: {
        userId: input.userId,
        clinicId: input.clinicId,
        attempts: { lt: input.maxAttempts - 1 },
      },
      data: { attempts: { increment: 1 } },
    });
    if (incremented.count === 1) {
      return { status: "recorded" };
    }

    const deleted = await prisma.otpState.deleteMany({
      where: {
        userId: input.userId,
        clinicId: input.clinicId,
        attempts: { gte: input.maxAttempts - 1 },
      },
    });
    return deleted.count === 1 ? { status: "locked" } : { status: "missing" };
  }

  async reserveOtpResend(input: {
    id: string;
    userId: string;
    clinicId: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMs: number;
    maxResends: number;
  }): Promise<OtpResendReservation> {
    const eligibleBefore = new Date(input.now.getTime() - input.cooldownMs);
    const reserved = await prisma.otpState.updateMany({
      where: {
        userId: input.userId,
        clinicId: input.clinicId,
        resends: { lt: input.maxResends },
        lastSentAt: { lte: eligibleBefore },
      },
      data: {
        email: input.email,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        attempts: 0,
        resends: { increment: 1 },
        lastSentAt: input.now,
      },
    });
    if (reserved.count === 1) {
      const state = await this.findOtpStateByUserId(input.userId);
      return { status: "reserved", resends: state?.resends ?? input.maxResends };
    }

    const state = await this.findOtpStateByUserId(input.userId);
    if (!state) {
      try {
        await prisma.otpState.create({
          data: {
            id: input.id,
            userId: input.userId,
            clinicId: input.clinicId,
            email: input.email,
            codeHash: input.codeHash,
            expiresAt: input.expiresAt,
            attempts: 0,
            resends: 0,
            lastSentAt: input.now,
          },
        });
        return { status: "reserved", resends: 0 };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          return this.reserveOtpResend(input);
        }
        throw error;
      }
    }

    if (state.resends >= input.maxResends) {
      return { status: "limit_reached" };
    }
    return { status: "cooldown", state };
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
