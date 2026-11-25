import { describe, expect, it, vi } from "vitest";

import {
  AuthStateController,
  type ProviderSessionManager,
} from "../../features/auth/providers/AuthProvider";
import {
  SIGN_IN_FIELDS,
  hasAlternativeAuthControls,
} from "../../features/auth/contracts/signInContract";

function createSessionManagerStub(
  overrides: Partial<ProviderSessionManager> = {},
): ProviderSessionManager {
  return {
    async signIn() {
      return;
    },
    async applyTokens() {
      return;
    },
    async signOut() {
      return;
    },
    async restoreSession() {
      return "unauthenticated";
    },
    async runAuthenticatedRequest<TResult>(
      request: (accessToken: string) => Promise<TResult>,
    ): Promise<TResult> {
      return request("access-token");
    },
    ...overrides,
  };
}

describe("auth provider state transitions", () => {
  it("sign-in screen exposes only email and password fields with submit action", () => {
    expect(SIGN_IN_FIELDS).toEqual(["email", "password"]);
    expect(hasAlternativeAuthControls).toBe(false);
  });

  it("successful submit transitions from unauthenticated to authenticated", async () => {
    const sessionManager = createSessionManagerStub();
    const controller = new AuthStateController(sessionManager);

    expect(controller.getStatus()).toBe("loading");

    await controller.bootstrap();
    expect(controller.getStatus()).toBe("unauthenticated");

    await controller.signIn("clinician@example.com", "Passw0rd!");
    expect(controller.getStatus()).toBe("authenticated");
  });

  it("OTP token application transitions to authenticated", async () => {
    const applyTokens = vi.fn<ProviderSessionManager["applyTokens"]>();
    const sessionManager = createSessionManagerStub({ applyTokens });
    const controller = new AuthStateController(sessionManager);

    await controller.bootstrap();
    await controller.applyTokens({
      accessToken: "otp-access-token",
      refreshToken: "otp-refresh-token",
    });

    expect(applyTokens).toHaveBeenCalledWith({
      accessToken: "otp-access-token",
      refreshToken: "otp-refresh-token",
    });
    expect(controller.getStatus()).toBe("authenticated");
  });

  it("bootstrap restoreSession runs before settling to unauthenticated shell", async () => {
    const restoreSession = vi
      .fn<ProviderSessionManager["restoreSession"]>()
      .mockResolvedValue("unauthenticated");
    const sessionManager = createSessionManagerStub({ restoreSession });
    const controller = new AuthStateController(sessionManager);

    await controller.bootstrap();

    expect(restoreSession).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe("unauthenticated");
  });

  it("refresh failure after retry returns user to sign-in screen", async () => {
    const sessionManager = createSessionManagerStub({
      async restoreSession() {
        return "authenticated";
      },
      async runAuthenticatedRequest() {
        throw new Error("Unauthenticated");
      },
    });
    const controller = new AuthStateController(sessionManager);

    await controller.bootstrap();
    expect(controller.getStatus()).toBe("authenticated");

    await expect(
      controller.runProtectedAction(async () => ({ ok: true })),
    ).rejects.toThrow(/Unauthenticated/);

    expect(controller.getStatus()).toBe("unauthenticated");
  });
});
