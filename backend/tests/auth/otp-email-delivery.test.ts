import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

function parseStructuredEntries(calls: unknown[][]): Array<Record<string, unknown>> {
  return calls.flatMap(([entry]) => {
    if (typeof entry !== "string") {
      return [];
    }

    try {
      return [JSON.parse(entry) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

describe("email OTP providers", () => {
  beforeEach(() => {
    process.env.SES_FROM_EMAIL = "no-reply@example.com";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("uses the local console provider in local mode and prints the OTP to stdout", async () => {
    process.env.APP_ENV = "local";

    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const {
      createEmailOtpProvider,
      LocalConsoleEmailOtpProvider,
    } = await import("../../src/domain/auth/emailOtpProvider.js");

    const provider = createEmailOtpProvider();

    expect(provider).toBeInstanceOf(LocalConsoleEmailOtpProvider);
    await expect(
      provider.sendOtp({
        email: "clinician@example.com",
        code: "123456",
        purpose: "signup",
      }),
    ).resolves.toEqual({
      success: true,
      provider: "local-console",
    });

    expect(writeSpy).toHaveBeenCalledWith(
      "[local-email-otp] clinician@example.com (signup): 123456\n",
    );
  });

  it("uses SES in local mode when the opt-in flag is enabled", async () => {
    process.env.APP_ENV = "local";
    process.env.LOCAL_USE_SES_EMAIL_OTP = "true";

    const { createEmailOtpProvider, SesEmailOtpProvider } = await import(
      "../../src/domain/auth/emailOtpProvider.js"
    );

    expect(createEmailOtpProvider()).toBeInstanceOf(SesEmailOtpProvider);
  });

  it("uses SES in non-local mode with the configured sender address", async () => {
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "staging";

    const send = vi.fn().mockResolvedValue({ MessageId: "ses-message-1" });
    const { SesEmailOtpProvider } = await import(
      "../../src/domain/auth/emailOtpProvider.js"
    );
    const provider = new SesEmailOtpProvider({
      send,
    } as unknown as ConstructorParameters<typeof SesEmailOtpProvider>[0]);

    const result = await provider.sendOtp({
      email: "clinician@example.com",
      code: "654321",
      purpose: "forgot-password",
    });

    expect(result).toEqual({
      success: true,
      provider: "ses",
      messageId: "ses-message-1",
    });

    const [command] = send.mock.calls[0] as [{ input: Record<string, unknown> }];
    expect(command.input.FromEmailAddress).toBe("no-reply@example.com");
    expect(command.input.Destination).toEqual({
      ToAddresses: ["clinician@example.com"],
    });
  });

  it("does not leak raw OTP codes in SES logs", async () => {
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "staging";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { SesEmailOtpProvider } = await import(
      "../../src/domain/auth/emailOtpProvider.js"
    );
    const provider = new SesEmailOtpProvider({
      send: vi.fn().mockResolvedValue({ MessageId: "ses-message-2" }),
    } as unknown as ConstructorParameters<typeof SesEmailOtpProvider>[0]);

    try {
      await provider.sendOtp({
        email: "clinician@example.com",
        code: "999888",
        purpose: "signup",
      });

      const entries = [
        ...parseStructuredEntries(logSpy.mock.calls),
        ...parseStructuredEntries(warnSpy.mock.calls),
      ];
      expect(entries).toContainEqual(
        expect.objectContaining({
          message: "email_otp.sent",
          provider: "ses",
        }),
      );
      expect(JSON.stringify(entries)).not.toContain("999888");
      expect(JSON.stringify(entries)).not.toContain("clinician@example.com");
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
