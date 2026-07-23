import type {
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
} from "../../../../shared/contracts/auth";
import {
  clearRefreshToken,
  getRefreshToken,
  saveRefreshToken,
} from "../storage/refreshTokenStore";
import type { AuthApi } from "./authApi";
import { clearOfflinePhiData } from "../../offline/storage/queueStore";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthSessionTokens = SessionTokens;

type SessionAuthApi = Pick<AuthApi, "login" | "refresh" | "logout">;

type SessionManagerDependencies = {
  authApi: SessionAuthApi;
  onStateChange?: (status: SessionStatus) => void;
};

type UnauthorizedLikeError = {
  status?: number;
};

function isUnauthorizedError(error: unknown): error is UnauthorizedLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as UnauthorizedLikeError).status === 401
  );
}

export class SessionManager {
  private readonly authApi: SessionAuthApi;
  private readonly onStateChange?: (status: SessionStatus) => void;
  private accessToken: string | null = null;
  private state: SessionStatus = "unauthenticated";
  private readonly maxRefreshRetries = 1;

  constructor(dependencies: SessionManagerDependencies) {
    this.authApi = dependencies.authApi;
    if (dependencies.onStateChange !== undefined) {
      this.onStateChange = dependencies.onStateChange;
    }
  }

  getState(): SessionStatus {
    return this.state;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async signIn(email: string, password: string): Promise<void> {
    const payload: LoginRequest = { email, password };
    const response = await this.authApi.login(payload);
    await this.applySessionTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    });
  }

  async applyTokens(tokens: AuthSessionTokens): Promise<void> {
    await this.applySessionTokens(tokens);
  }

  async signOut(): Promise<void> {
    const refreshToken = await getRefreshToken();

    try {
      if (refreshToken) {
        const payload: LogoutRequest = { refreshToken };
        await this.authApi.logout(payload);
      }
    } finally {
      await this.forceUnauthenticated();
    }
  }

  async restoreSession(): Promise<SessionStatus> {
    this.setState("loading");

    const restored = await this.refreshAccessTokenWithRetry();
    if (!restored) {
      await this.forceUnauthenticated();
      return this.state;
    }

    return this.state;
  }

  async runAuthenticatedRequest<TResult>(
    request: (accessToken: string) => Promise<TResult>,
  ): Promise<TResult> {
    if (!this.accessToken) {
      throw new Error("Unauthenticated");
    }

    try {
      return await request(this.accessToken);
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        throw error;
      }

      const refreshed = await this.refreshAccessTokenWithRetry();
      if (!refreshed || !this.accessToken) {
        throw new Error("Unauthenticated");
      }

      return request(this.accessToken);
    }
  }

  private async refreshAccessTokenWithRetry(): Promise<boolean> {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    let attempts = 0;

    while (attempts <= this.maxRefreshRetries) {
      try {
        const payload: RefreshRequest = { refreshToken };
        const response = await this.authApi.refresh(payload);

        await this.applySessionTokens({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        });

        return true;
      } catch {
        attempts += 1;
        if (attempts <= this.maxRefreshRetries) {
          // silent retry of refresh before forcing re-login
          continue;
        }
      }
    }

    await this.forceUnauthenticated();
    return false;
  }

  private async applySessionTokens(tokens: SessionTokens): Promise<void> {
    this.accessToken = tokens.accessToken;
    await saveRefreshToken(tokens.refreshToken);
    this.setState("authenticated");
  }

  private async forceUnauthenticated(): Promise<void> {
    this.accessToken = null;
    this.setState("unauthenticated");

    try {
      await clearRefreshToken();
    } catch {
      // The server-side logout or failed refresh has already invalidated the
      // session. Never retain an authenticated in-memory state because local
      // secure storage is temporarily unavailable.
    }

    try {
      clearOfflinePhiData();
    } catch {
      // Keep logout fail-closed in memory even if best-effort local cleanup
      // encounters a device storage error.
    }
  }

  private setState(nextState: SessionStatus): void {
    this.state = nextState;
    if (this.onStateChange) {
      this.onStateChange(nextState);
    }
  }
}
