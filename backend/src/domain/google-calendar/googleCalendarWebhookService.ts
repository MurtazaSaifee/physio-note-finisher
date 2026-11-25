import { prisma } from "../../data/prismaClient.js";

export type WebhookVerificationResult =
  | { valid: true; clinicId: string; userId: string }
  | { valid: false };

export async function verifyWebhookChannel(
  channelId: string,
  channelToken: string,
): Promise<WebhookVerificationResult> {
  const connection = await prisma.googleCalendarConnection.findFirst({
    where: {
      channelId,
    },
  });

  if (!connection) {
    return { valid: false };
  }

  if (connection.channelToken !== channelToken) {
    return { valid: false };
  }

  if (!connection.channelExpiration) {
    return { valid: false };
  }

  if (connection.channelExpiration.getTime() <= Date.now()) {
    return { valid: false };
  }

  return {
    valid: true,
    clinicId: connection.clinicId,
    userId: connection.userId,
  };
}
