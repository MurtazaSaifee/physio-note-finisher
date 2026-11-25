import type {
  AuthUserRecord,
  OtpStateRecord,
  RefreshTokenRecord,
} from "../../api/routes/auth.js";

export type OtpInvalidAttemptOutcome =
  | { status: "recorded" }
  | { status: "locked" }
  | { status: "missing" };

export type OtpValidConsumeOutcome =
  | { status: "consumed" }
  | { status: "missing" };

export type OtpResendReservation =
  | { status: "reserved"; resends: number }
  | { status: "cooldown"; state: OtpStateRecord }
  | { status: "limit_reached" };

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | undefined>;
  findUserById(id: string): Promise<AuthUserRecord | undefined>;
  createUser(user: AuthUserRecord): Promise<void>;
  saveUser(user: AuthUserRecord): Promise<void>;
  createSignupSession?(input: {
    clinic: { id: string; name: string };
    user: AuthUserRecord;
  }): Promise<void>;

  findOtpStateByUserId(userId: string): Promise<OtpStateRecord | undefined>;
  saveOtpState(state: OtpStateRecord): Promise<void>;
  consumeValidOtp(input: {
    id: string;
    userId: string;
    clinicId: string;
    codeHash: string;
  }): Promise<OtpValidConsumeOutcome>;
  consumeInvalidOtpAttempt(input: {
    userId: string;
    clinicId: string;
    maxAttempts: number;
  }): Promise<OtpInvalidAttemptOutcome>;
  reserveOtpResend(input: {
    id: string;
    userId: string;
    clinicId: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMs: number;
    maxResends: number;
  }): Promise<OtpResendReservation>;

  findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | undefined>;
  createRefreshToken(record: RefreshTokenRecord): Promise<void>;
  saveRefreshToken(record: RefreshTokenRecord): Promise<void>;
  consumeRefreshTokenAndCreateSuccessor(input: {
    currentTokenHash: string;
    nextRecord: RefreshTokenRecord;
    revokedAt: Date;
  }): Promise<boolean>;
  listRefreshTokensByUser(userId: string): Promise<RefreshTokenRecord[]>;

  getTestOtpCode?(userId: string): string | undefined;
  setTestOtpCode?(userId: string, code: string): void;
  deleteTestOtpCode?(userId: string): void;
}
