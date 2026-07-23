import { describe, expect, it, vi } from "vitest";

import { createSettingsApi } from "./settingsApi";

describe("settingsApi.changePassword", () => {
  it("uses the authenticated change-password contract", async () => {
    const transport = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return { updated: true };
      },
    }));
    const api = createSettingsApi(
      "http://localhost:3000",
      transport,
    );

    await expect(
      api.changePassword("access-token", {
        currentPassword: "password123",
        newPassword: "new-password-123",
      }),
    ).resolves.toEqual({ updated: true });

    expect(transport).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/auth/change-password",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer access-token",
        }),
        body: JSON.stringify({
          currentPassword: "password123",
          newPassword: "new-password-123",
        }),
      }),
    );
  });
});
