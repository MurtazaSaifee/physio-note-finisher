import { randomBytes } from "node:crypto";
import { google } from "googleapis";

import { prisma } from "../../data/prismaClient.js";
import { encryptToken } from "./tokenCipher.js";
import type { GoogleCalendarConnectionResponse } from "../../../../shared/contracts/appointments.js";
import { isLocalGoogleCalendarMode } from "./googleCalendarRuntime.js";
import {
  deleteLocalGoogleCalendarConnection,
  getLocalGoogleCalendarConnection,
  upsertLocalGoogleCalendarConnection,
} from "./googleCalendarLocalStore.js";

const LOCAL_GOOGLE_CALENDAR_URL = "physio-local://google-calendar/connected";
const LOCAL_GOOGLE_CALENDAR_ACCOUNT = "local-calendar@physio.local";
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function createGoogleCalendarOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueGoogleCalendarOAuthState(
  clinicId: string,
  userId: string,
): Promise<string> {
  if (isLocalGoogleCalendarMode()) {
    return "";
  }

  const state = createGoogleCalendarOAuthState();
  const expiresAt = new Date(Date.now() + GOOGLE_OAUTH_STATE_TTL_MS);

  await prisma.googleCalendarOAuthState.create({
    data: {
      state,
      clinicId,
      userId,
      expiresAt,
    },
  });

  return state;
}

export async function consumeGoogleCalendarOAuthState(
  clinicId: string,
  userId: string,
  state?: string,
): Promise<void> {
  if (isLocalGoogleCalendarMode()) {
    return;
  }

  if (!state) {
    throw new Error("Missing Google Calendar OAuth state");
  }

  const pendingState = await prisma.googleCalendarOAuthState.findFirst({
    where: {
      state,
      clinicId,
      userId,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!pendingState) {
    throw new Error("Invalid or expired Google Calendar OAuth state");
  }

  await prisma.googleCalendarOAuthState.delete({
    where: {
      state: pendingState.state,
    },
  });
}

export function buildGoogleConnectUrl(
  clinicId: string,
  userId: string,
  state?: string,
): string {
  if (isLocalGoogleCalendarMode()) {
    upsertLocalGoogleCalendarConnection({
      clinicId,
      userId,
      accountEmail: LOCAL_GOOGLE_CALENDAR_ACCOUNT,
      lastSyncedAt: new Date().toISOString(),
      lastSyncError: null,
    });
    return LOCAL_GOOGLE_CALENDAR_URL;
  }

  if (!state) {
    throw new Error("Missing Google Calendar OAuth state");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
    prompt: "consent",
  });
}

export async function exchangeGoogleCode(
  clinicId: string,
  userId: string,
  code: string,
): Promise<GoogleCalendarConnectionResponse> {
  if (isLocalGoogleCalendarMode()) {
    upsertLocalGoogleCalendarConnection({
      clinicId,
      userId,
      accountEmail: LOCAL_GOOGLE_CALENDAR_ACCOUNT,
      lastSyncedAt: new Date().toISOString(),
      lastSyncError: null,
    });

    return {
      connected: true,
      accountEmail: LOCAL_GOOGLE_CALENDAR_ACCOUNT,
      lastSyncedAt: new Date().toISOString(),
      syncState: "connected",
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  );

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error("No refresh token returned from Google");
  }

  const encryptedRefreshToken = encryptToken(tokens.refresh_token);

  await prisma.googleCalendarConnection.upsert({
    where: {
      userId_clinicId: {
        userId,
        clinicId,
      },
    },
    create: {
      userId,
      clinicId,
      refreshToken: encryptedRefreshToken,
    },
    update: {
      refreshToken: encryptedRefreshToken,
      lastSyncError: null,
    },
  });

  return {
    connected: true,
    accountEmail: null,
    lastSyncedAt: null,
    syncState: "connected",
  };
}

export async function disconnectGoogleCalendar(
  clinicId: string,
  userId: string,
): Promise<void> {
  if (isLocalGoogleCalendarMode()) {
    deleteLocalGoogleCalendarConnection(clinicId, userId);
    return;
  }

  await prisma.googleCalendarConnection.delete({
    where: {
      userId_clinicId: {
        userId,
        clinicId,
      },
    },
  });
}

export async function getGoogleCalendarConnectionStatus(
  clinicId: string,
  userId: string,
): Promise<GoogleCalendarConnectionResponse> {
  if (isLocalGoogleCalendarMode()) {
    const connection = getLocalGoogleCalendarConnection(clinicId, userId);

    if (!connection) {
      return {
        connected: false,
        accountEmail: null,
        lastSyncedAt: null,
        syncState: "disconnected",
      };
    }

    return {
      connected: true,
      accountEmail: connection.accountEmail,
      lastSyncedAt: connection.lastSyncedAt,
      syncState: connection.lastSyncError ? "needs_attention" : "connected",
    };
  }

  const connection = await prisma.googleCalendarConnection.findFirst({
    where: {
      clinicId,
      userId,
    },
  });

  if (!connection) {
    return {
      connected: false,
      accountEmail: null,
      lastSyncedAt: null,
      syncState: "disconnected",
    };
  }

  const syncState: GoogleCalendarConnectionResponse["syncState"] = connection.lastSyncError
    ? "needs_attention"
    : "connected";

  return {
    connected: true,
    accountEmail: null,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    syncState,
  };
}
