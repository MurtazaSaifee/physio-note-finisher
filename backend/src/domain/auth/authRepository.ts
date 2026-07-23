import type {
  AuthUserRecord,
  RefreshTokenRecord,
} from "../../api/routes/auth.js";

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | undefined>;
  findUserById(id: string): Promise<AuthUserRecord | undefined>;
  createUser(user: AuthUserRecord): Promise<void>;
  saveUser(user: AuthUserRecord): Promise<void>;

  findRefreshTokenByHash(hash: string): Promise<RefreshTokenRecord | undefined>;
  createRefreshToken(record: RefreshTokenRecord): Promise<void>;
  saveRefreshToken(record: RefreshTokenRecord): Promise<void>;
  consumeRefreshTokenAndCreateSuccessor(input: {
    currentTokenHash: string;
    nextRecord: RefreshTokenRecord;
    revokedAt: Date;
  }): Promise<boolean>;
  listRefreshTokensByUser(userId: string): Promise<RefreshTokenRecord[]>;
}
