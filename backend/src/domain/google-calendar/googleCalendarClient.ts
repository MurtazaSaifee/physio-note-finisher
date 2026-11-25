import { google } from "googleapis";

import { prisma } from "../../data/prismaClient.js";
import { decryptToken } from "./tokenCipher.js";

export async function getGoogleCalendarClient(
  clinicId: string,
  userId: string,
): Promise<ReturnType<typeof google.calendar>> {
  const connection = await prisma.googleCalendarConnection.findFirst({
    where: {
      clinicId,
      userId,
    },
  });

  if (!connection) {
    throw new Error("Google Calendar connection not found");
  }

  const refreshToken = decryptToken(connection.refreshToken);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}
