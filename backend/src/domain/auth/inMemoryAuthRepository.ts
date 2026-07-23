import type {
  AuthUserRecord,
  RefreshTokenRecord,
} from "../../api/routes/auth.js";
import type { AuthRepository } from "./authRepository.js";

export class InMemoryAuthRepository implements AuthRepository {
  usersByEmail = new Map<string, AuthUserRecord>();
  usersById = new Map<string, AuthUserRecord>();
  refreshTokensByHash = new Map<string, RefreshTokenRecord>();

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
}
