import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  REFRESH_TOKEN_STORAGE_KEY,
  clearRefreshToken,
  getRefreshToken,
  setSecureStoreImplementation,
} from "../../features/auth/storage/refreshTokenStore";
import { SessionManager } from "../../features/auth/services/sessionManager";

describe("session manager", () => {
  beforeEach(async () => {
    let persistedValue: string | null = null;

    setSecureStoreImplementation({
      setItemAsync: vi.fn(async (key, value) => {
        expect(key).toBe(REFRESH_TOKEN_STORAGE_KEY);
        persistedValue = value;
      }),
      getItemAsync: vi.fn(async (key) => {
        expect(key).toBe(REFRESH_TOKEN_STORAGE_KEY);
        return persistedValue;
      }),
      deleteItemAsync: vi.fn(async (key) => {
        expect(key).toBe(REFRESH_TOKEN_STORAGE_KEY);
        persistedValue = null;
      }),
    });

    await clearRefreshToken();
  });

  it("stores refresh token in secure storage key physio.auth.refresh_token on login", async () => {
    const manager = new SessionManager({
      authApi: {
        login: vi.fn(async () => ({
          accessToken: "access-token-1",
          refreshToken: "refresh-token-1",
        })),
        refresh: vi.fn(async () => ({
          accessToken: "access-token-2",
          refreshToken: "refresh-token-2",
        })),
        logout: vi.fn(async () => ({ revoked: true })),
      },
    });

    await manager.signIn("clinician@example.com", "Passw0rd!");

    expect(await getRefreshToken()).toBe("refresh-token-1");
  });

  it("keeps access token in memory and clears it on signOut", async () => {
    const manager = new SessionManager({
      authApi: {
        login: vi.fn(async () => ({
          accessToken: "access-token-in-memory",
          refreshToken: "refresh-token-only-on-disk",
        })),
        refresh: vi.fn(async () => ({
          accessToken: "access-token-new",
          refreshToken: "refresh-token-new",
        })),
        logout: vi.fn(async () => ({ revoked: true })),
      },
    });

    await manager.signIn("clinician@example.com", "Passw0rd!");

    expect(manager.getAccessToken()).toBe("access-token-in-memory");

    await manager.signOut();

    expect(manager.getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it("stores OTP verification tokens through the same session path", async () => {
    const manager = new SessionManager({
      authApi: {
        login: vi.fn(),
        refresh: vi.fn(async () => ({
          accessToken: "access-token-new",
          refreshToken: "refresh-token-new",
        })),
        logout: vi.fn(async () => ({ revoked: true })),
      },
    });

    await manager.applyTokens({
      accessToken: "otp-access-token",
      refreshToken: "otp-refresh-token",
    });

    expect(manager.getState()).toBe("authenticated");
    expect(manager.getAccessToken()).toBe("otp-access-token");
    expect(await getRefreshToken()).toBe("otp-refresh-token");
  });

  it("on 401 performs one silent retry refresh and retries original request once", async () => {
    const refresh = vi.fn(async () => ({
      accessToken: "access-token-after-refresh",
      refreshToken: "refresh-token-after-refresh",
    }));

    const manager = new SessionManager({
      authApi: {
        login: vi.fn(async () => ({
          accessToken: "access-token-original",
          refreshToken: "refresh-token-original",
        })),
        refresh,
        logout: vi.fn(async () => ({ revoked: true })),
      },
    });

    await manager.signIn("clinician@example.com", "Passw0rd!");

    const protectedCall = vi
      .fn()
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ ok: true });

    const result = await manager.runAuthenticatedRequest(protectedCall);

    expect(result).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(protectedCall).toHaveBeenCalledTimes(2);
  });

  it("forces re-login when refresh fails twice", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("first refresh failure"))
      .mockRejectedValueOnce(new Error("second refresh failure"));

    const manager = new SessionManager({
      authApi: {
        login: vi.fn(async () => ({
          accessToken: "access-token-original",
          refreshToken: "refresh-token-original",
        })),
        refresh,
        logout: vi.fn(async () => ({ revoked: true })),
      },
    });

    await manager.signIn("clinician@example.com", "Passw0rd!");

    await expect(
      manager.runAuthenticatedRequest(async () => {
        throw { status: 401 };
      }),
    ).rejects.toThrow(/Unauthenticated/);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(manager.getState()).toBe("unauthenticated");
    expect(await getRefreshToken()).toBeNull();
  });
});
