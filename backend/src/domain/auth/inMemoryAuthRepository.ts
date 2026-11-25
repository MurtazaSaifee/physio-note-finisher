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

export class InMemoryAuthRepository implements AuthRepository {
  usersByEmail = new Map<string, AuthUserRecord>();
  usersById = new Map<string, AuthUserRecord>();
  refreshTokensByHash = new Map<string, RefreshTokenRecord>();
  otpStatesByUserId = new Map<string, OtpStateRecord>();
  testOtpCodesByUserId?: Map<string, string>;

  constructor(options?: { captureOtpCodes?: boolean }) {
    const captureOtpCodes =
      options?.captureOtpCodes ?? process.env.NODE_ENV === "test";
    if (captureOtpCodes) {
      this.testOtpCodesByUserId = new Map<string, string>();
    }
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | undefined> {
    return this.usersByEmail.get(email);
  }

  async findUserById(id: string): Promise<AuthUserRecord | undefined> {
    return this.usersById.get(id);
  }

  async createUser(user: AuthUserRecord): Promise<void> {
    this.usersByEmail.set(user.email, user);
    this.usersById.set(user.id, user);
  }

  async saveUser(user: AuthUserRecord): Promise<void> {
    this.usersById.set(user.id, user);
    this.usersByEmail.set(user.email, user);
  }

  async createSignupSession(input: {
    clinic: { id: string; name: string };
    user: AuthUserRecord;
  }): Promise<void> {
    void input.clinic;
    await this.createUser(input.user);
  }

  async findOtpStateByUserId(
    userId: string,
  ): Promise<OtpStateRecord | undefined> {
    return this.otpStatesByUserId.get(userId);
  }

  async saveOtpState(state: OtpStateRecord): Promise<void> {
    this.otpStatesByUserId.set(state.userId, state);
  }

  async consumeValidOtp(input: {
    id: string;
    userId: string;
    clinicId: string;
    codeHash: string;
  }): Promise<OtpValidConsumeOutcome> {
    const state = this.otpStatesByUserId.get(input.userId);
    if (
      !state ||
      state.id !== input.id ||
      state.clinicId !== input.clinicId ||
      state.codeHash !== input.codeHash
    ) {
      return { status: "missing" };
    }

    this.otpStatesByUserId.delete(input.userId);
    return { status: "consumed" };
  }

  async consumeInvalidOtpAttempt(input: {
    userId: string;
    clinicId: string;
    maxAttempts: number;
  }): Promise<OtpInvalidAttemptOutcome> {
    const state = this.otpStatesByUserId.get(input.userId);
    if (!state || state.clinicId !== input.clinicId) {
      return { status: "missing" };
    }

    if (state.attempts + 1 >= input.maxAttempts) {
      this.otpStatesByUserId.delete(input.userId);
      return { status: "locked" };
    }

    this.otpStatesByUserId.set(input.userId, {
      ...state,
      attempts: state.attempts + 1,
    });
    return { status: "recorded" };
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
    const state = this.otpStatesByUserId.get(input.userId);
    if (!state) {
      this.otpStatesByUserId.set(input.userId, {
        id: input.id,
        userId: input.userId,
        clinicId: input.clinicId,
        email: input.email,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        attempts: 0,
        resends: 0,
        lastSentAt: input.now,
      });
      return { status: "reserved", resends: 0 };
    }

    const retryAfterMs = state.lastSentAt.getTime() + input.cooldownMs - input.now.getTime();
    if (retryAfterMs > 0) {
      return { status: "cooldown", state };
    }

    if (state.resends >= input.maxResends) {
      return { status: "limit_reached" };
    }

    const resends = state.resends + 1;
    this.otpStatesByUserId.set(input.userId, {
      ...state,
      email: input.email,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attempts: 0,
      resends,
      lastSentAt: input.now,
    });
    return { status: "reserved", resends };
  }

  async findRefreshTokenByHash(
    hash: string,
  ): Promise<RefreshTokenRecord | undefined> {
    return this.refreshTokensByHash.get(hash);
  }

  async createRefreshToken(record: RefreshTokenRecord): Promise<void> {
    this.refreshTokensByHash.set(record.tokenHash, record);
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    this.refreshTokensByHash.set(record.tokenHash, record);
  }

  async consumeRefreshTokenAndCreateSuccessor(input: {
    currentTokenHash: string;
    nextRecord: RefreshTokenRecord;
    revokedAt: Date;
  }): Promise<boolean> {
    const currentRecord = this.refreshTokensByHash.get(input.currentTokenHash);
    if (
      !currentRecord ||
      currentRecord.revokedAt ||
      currentRecord.expiresAt.getTime() <= input.revokedAt.getTime()
    ) {
      return false;
    }

    this.refreshTokensByHash.set(input.currentTokenHash, {
      ...currentRecord,
      revokedAt: input.revokedAt,
      replacedByTokenHash: input.nextRecord.tokenHash,
    });
    this.refreshTokensByHash.set(input.nextRecord.tokenHash, input.nextRecord);
    return true;
  }

  async listRefreshTokensByUser(
    userId: string,
  ): Promise<RefreshTokenRecord[]> {
    return Array.from(this.refreshTokensByHash.values()).filter(
      (rt) => rt.userId === userId,
    );
  }

  getTestOtpCode(userId: string): string | undefined {
    return this.testOtpCodesByUserId?.get(userId);
  }

  setTestOtpCode(userId: string, code: string): void {
    this.testOtpCodesByUserId?.set(userId, code);
  }

  deleteTestOtpCode(userId: string): void {
    this.testOtpCodesByUserId?.delete(userId);
  }
}
