import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  OtpStateRecord,
  RefreshTokenRecord,
} from "../../src/api/routes/auth.js";

const { otpStates, refreshTokens } = vi.hoisted(() => ({
  otpStates: new Map<string, OtpStateRecord>(),
  refreshTokens: new Map<
    string,
    RefreshTokenRecord & { id: string; replacedByTokenId: string | null }
  >(),
}));

function findOtp(where: Record<string, unknown>): OtpStateRecord | undefined {
  return Array.from(otpStates.values()).find(
    (state) =>
      (where.userId === undefined || state.userId === where.userId) &&
      (where.clinicId === undefined || state.clinicId === where.clinicId),
  );
}

function matchesOtp(state: OtpStateRecord, where: Record<string, unknown>): boolean {
  return (
    (where.id === undefined || state.id === where.id) &&
    (where.userId === undefined || state.userId === where.userId) &&
    (where.clinicId === undefined || state.clinicId === where.clinicId) &&
    (where.codeHash === undefined || state.codeHash === where.codeHash)
  );
}

vi.mock("../../src/data/prismaClient.js", () => ({
  prisma: (() => {
    const refreshToken = {
      updateMany: vi.fn(async ({ where, data }) => {
        const record = refreshTokens.get(where.tokenHash);
        if (
          !record ||
          record.revokedAt !== where.revokedAt ||
          record.expiresAt <= where.expiresAt.gt
        ) {
          return { count: 0 };
        }

        refreshTokens.set(record.tokenHash, { ...record, ...data });
        return { count: 1 };
      }),
      create: vi.fn(async ({ data }) => {
        const record = {
          id: `refresh-${refreshTokens.size + 1}`,
          ...data,
          replacedByTokenId: null,
        };
        refreshTokens.set(record.tokenHash, record);
        return record;
      }),
      update: vi.fn(async ({ where, data }) => {
        const record = refreshTokens.get(where.tokenHash);
        if (!record) {
          throw new Error("Refresh token not found");
        }

        const next = { ...record, ...data };
        refreshTokens.set(record.tokenHash, next);
        return next;
      }),
    };

    return {
      $transaction: vi.fn(async (operation) => operation({ refreshToken })),
      refreshToken,
    otpState: {
      findFirst: vi.fn(async ({ where }) => findOtp(where)),
      upsert: vi.fn(async ({ where, create, update }) => {
        const existing = findOtp(where.userId_clinicId);
        const next = existing ? { ...existing, ...update } : { ...create };
        otpStates.set(next.userId, next);
        return next;
      }),
      create: vi.fn(async ({ data }) => {
        if (findOtp({ userId: data.userId, clinicId: data.clinicId })) {
          throw { code: "P2002" };
        }
        otpStates.set(data.userId, { ...data });
        return data;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const state = findOtp(where);
        if (!state) {
          return { count: 0 };
        }

        if (where.attempts && state.attempts >= where.attempts.lt) {
          return { count: 0 };
        }
        if (where.resends && state.resends >= where.resends.lt) {
          return { count: 0 };
        }
        if (where.lastSentAt && state.lastSentAt > where.lastSentAt.lte) {
          return { count: 0 };
        }

        otpStates.set(state.userId, {
          ...state,
          ...data,
          attempts:
            typeof data.attempts === "object"
              ? state.attempts + data.attempts.increment
              : data.attempts ?? state.attempts,
          resends:
            typeof data.resends === "object"
              ? state.resends + data.resends.increment
              : data.resends ?? state.resends,
        });
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const state = findOtp(where);
        if (
          !state ||
          !matchesOtp(state, where) ||
          (where.attempts && state.attempts < where.attempts.gte)
        ) {
          return { count: 0 };
        }
        otpStates.delete(state.userId);
        return { count: 1 };
      }),
    },
    };
  })(),
}));

import { PrismaAuthRepository } from "../../src/domain/auth/prismaAuthRepository.js";

const userId = "user-1";
const clinicId = "clinic-1";

function otpState(overrides: Partial<OtpStateRecord> = {}): OtpStateRecord {
  return {
    id: "otp-1",
    userId,
    clinicId,
    email: "clinician@example.com",
    codeHash: "hash",
    expiresAt: new Date("2026-07-17T15:30:00.000Z"),
    attempts: 0,
    resends: 0,
    lastSentAt: new Date("2026-07-17T15:00:00.000Z"),
    ...overrides,
  };
}

function refreshTokenRecord(
  overrides: Partial<RefreshTokenRecord> = {},
): RefreshTokenRecord {
  return {
    tokenHash: "refresh-current",
    userId,
    clinicId,
    sessionId: "session-current",
    tokenVersion: 0,
    expiresAt: new Date("2026-07-17T16:00:00.000Z"),
    revokedAt: null,
    replacedByTokenHash: null,
    ...overrides,
  };
}

describe("PrismaAuthRepository OTP race guards", () => {
  beforeEach(() => {
    otpStates.clear();
    refreshTokens.clear();
    vi.clearAllMocks();
  });

  it("counts at most five invalid verification attempts under parallel requests", async () => {
    const repository = new PrismaAuthRepository();
    await repository.saveOtpState(otpState());

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        repository.consumeInvalidOtpAttempt({
          userId,
          clinicId,
          maxAttempts: 5,
        }),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === "recorded")).toHaveLength(4);
    expect(outcomes.filter((outcome) => outcome.status === "locked")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "missing")).toHaveLength(7);
    expect(await repository.findOtpStateByUserId(userId)).toBeUndefined();
  });

  it("reserves only the final resend slot under parallel requests", async () => {
    const repository = new PrismaAuthRepository();
    const now = new Date("2026-07-17T15:02:00.000Z");
    await repository.saveOtpState(
      otpState({
        resends: 2,
        lastSentAt: new Date("2026-07-17T15:00:00.000Z"),
      }),
    );

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repository.reserveOtpResend({
          id: `otp-${index}`,
          userId,
          clinicId,
          email: "clinician@example.com",
          codeHash: `hash-${index}`,
          expiresAt: new Date("2026-07-17T15:30:00.000Z"),
          now,
          cooldownMs: 60_000,
          maxResends: 3,
        }),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === "reserved")).toHaveLength(1);
    expect(await repository.findOtpStateByUserId(userId)).toMatchObject({
      resends: 3,
    });
  });

  it("consumes a valid OTP exactly once under parallel requests", async () => {
    const repository = new PrismaAuthRepository();
    const state = otpState();
    await repository.saveOtpState(state);

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        repository.consumeValidOtp({
          id: state.id,
          userId,
          clinicId,
          codeHash: state.codeHash,
        }),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === "consumed")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "missing")).toHaveLength(11);
  });

  it("does not consume a replacement OTP using an old code hash", async () => {
    const repository = new PrismaAuthRepository();
    const state = otpState();
    await repository.saveOtpState(state);
    await repository.saveOtpState({ ...state, codeHash: "replacement-hash" });

    const outcome = await repository.consumeValidOtp({
      id: state.id,
      userId,
      clinicId,
      codeHash: state.codeHash,
    });

    expect(outcome).toEqual({ status: "missing" });
    expect(await repository.findOtpStateByUserId(userId)).toMatchObject({
      codeHash: "replacement-hash",
    });
  });

  it("consumes a refresh token exactly once while creating one successor", async () => {
    const repository = new PrismaAuthRepository();
    const current = refreshTokenRecord();
    refreshTokens.set(current.tokenHash, {
      ...current,
      id: "refresh-current-id",
      replacedByTokenId: null,
    });
    const revokedAt = new Date("2026-07-17T15:30:00.000Z");

    const outcomes = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        repository.consumeRefreshTokenAndCreateSuccessor({
          currentTokenHash: current.tokenHash,
          revokedAt,
          nextRecord: refreshTokenRecord({
            tokenHash: `refresh-next-${index}`,
            sessionId: `session-next-${index}`,
          }),
        }),
      ),
    );

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(refreshTokens).toHaveLength(2);
    expect(refreshTokens.get(current.tokenHash)).toMatchObject({
      revokedAt,
      replacedByTokenId: expect.any(String),
    });
  });
});
