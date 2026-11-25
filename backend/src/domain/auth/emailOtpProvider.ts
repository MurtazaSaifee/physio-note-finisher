import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

import { parseEmailOtpEnv, shouldUseSesEmailOtp } from "../../config/env.js";
import { createLogger } from "../../observability/logger.js";

const logger = createLogger();

export interface EmailOtpDeliveryResult {
  success: boolean;
  provider: "local-console" | "ses";
  messageId?: string;
  error?: string;
}

export interface EmailOtpParams {
  email: string;
  code: string;
  purpose?: string;
}

export interface EmailOtpProvider {
  sendOtp(params: EmailOtpParams): Promise<EmailOtpDeliveryResult>;
}

function describePurpose(purpose?: string): string {
  if (purpose === "forgot-password") {
    return "password reset";
  }

  return "sign-in verification";
}

function buildEmailContent(code: string, purpose?: string): {
  subject: string;
  textBody: string;
} {
  const action = describePurpose(purpose);

  return {
    subject: "Your Physio Note Finisher verification code",
    textBody:
      `Use this code to complete ${action}: ${code}\n\n` +
      "The code expires in 10 minutes.\n\n" +
      "If you did not request this, you can ignore this email.",
  };
}

export class LocalConsoleEmailOtpProvider implements EmailOtpProvider {
  async sendOtp(params: EmailOtpParams): Promise<EmailOtpDeliveryResult> {
    process.stdout.write(
      `[local-email-otp] ${params.email} (${params.purpose ?? "auth"}): ${params.code}\n`,
    );

    return {
      success: true,
      provider: "local-console",
    };
  }
}

export class SesEmailOtpProvider implements EmailOtpProvider {
  private readonly client: SESv2Client;
  private readonly fromEmail: string;

  constructor(client = new SESv2Client({})) {
    this.client = client;
    this.fromEmail = parseEmailOtpEnv().sesFromEmail;
  }

  async sendOtp(params: EmailOtpParams): Promise<EmailOtpDeliveryResult> {
    const content = buildEmailContent(params.code, params.purpose);

    try {
      const result = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.fromEmail,
          Destination: {
            ToAddresses: [params.email],
          },
          Content: {
            Simple: {
              Subject: {
                Data: content.subject,
              },
              Body: {
                Text: {
                  Data: content.textBody,
                },
              },
            },
          },
        }),
      );

      logger.info("email_otp.sent", {
        provider: "ses",
        messageId: result.MessageId,
      });

      return {
        success: true,
        provider: "ses",
        ...(result.MessageId ? { messageId: result.MessageId } : {}),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SES email delivery failed";

      logger.warn("email_otp.failed", {
        provider: "ses",
        error: message,
      });

      return {
        success: false,
        provider: "ses",
        error: message,
      };
    }
  }
}

export function createEmailOtpProvider(): EmailOtpProvider {
  return shouldUseSesEmailOtp()
    ? new SesEmailOtpProvider()
    : new LocalConsoleEmailOtpProvider();
}

export { buildEmailContent };
