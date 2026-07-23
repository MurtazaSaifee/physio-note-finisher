import { beforeEach, describe, expect, it } from "vitest";

import { setSecureStoreImplementation } from "../storage/refreshTokenStore";
import { SessionManager } from "./sessionManager";

describe("SessionManager.signOut", () => {
  beforeEach(() => {
    let token: string | null = "refresh-token";
    setSecureStoreImplementation({
      async setItemAsync(_key, value) {
        token = value;
      },
      async getItemAsync() {
        return token;
      },
      async deleteItemAsync() {
        throw new Error("secure store temporarily unavailable");
      },
    });
  });

  it("still clears in-memory authentication when local token deletion fails", async () => {
    const manager = new SessionManager({
      authApi: {
        async login() {
          throw new Error("not used");
        },
        async refresh() {
          throw new Error("not used");
        },
        async logout() {
          return { revoked: true };
        },
      },
    });
    await manager.applyTokens({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    await expect(manager.signOut()).resolves.toBeUndefined();
    expect(manager.getState()).toBe("unauthenticated");
    expect(manager.getAccessToken()).toBeNull();
  });
});
