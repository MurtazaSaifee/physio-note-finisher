import { prisma } from "../../data/prismaClient.js";
import type {
  NotificationPreferenceResponse,
  ReminderTimingOption,
} from "../../../../shared/contracts/appointments.js";

const VALID_TIMING_OPTIONS: ReminderTimingOption[] = ["30m", "1h", "2h", "1d"];

export class InvalidReminderTimingError extends Error {
  constructor() {
    super("Invalid reminder timing");
    this.name = "InvalidReminderTimingError";
  }
}

export class InvalidPushTokenError extends Error {
  constructor() {
    super("Invalid push token");
    this.name = "InvalidPushTokenError";
  }
}

function isValidTiming(value: string): value is ReminderTimingOption {
  return VALID_TIMING_OPTIONS.includes(value as ReminderTimingOption);
}

export function isValidExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") && token.endsWith("]");
}

export async function getReminderPreference(input: {
  userId: string;
  clinicId: string;
}): Promise<NotificationPreferenceResponse> {
  const preference = await prisma.clinicianNotificationPreference.findUnique({
    where: {
      userId_clinicId: {
        userId: input.userId,
        clinicId: input.clinicId,
      },
    },
  });

  if (!preference) {
    return {
      defaultReminderTiming: "30m",
      pushEnabled: true,
    };
  }

  return {
    defaultReminderTiming: preference.defaultReminderTiming as ReminderTimingOption,
    pushEnabled: preference.pushEnabled,
  };
}

export async function updateReminderPreference(input: {
  userId: string;
  clinicId: string;
  defaultReminderTiming: string;
  pushEnabled: boolean;
}): Promise<NotificationPreferenceResponse> {
  if (!isValidTiming(input.defaultReminderTiming)) {
    throw new InvalidReminderTimingError();
  }

  const preference = await prisma.clinicianNotificationPreference.upsert({
    where: {
      userId_clinicId: {
        userId: input.userId,
        clinicId: input.clinicId,
      },
    },
    update: {
      defaultReminderTiming: input.defaultReminderTiming,
      pushEnabled: input.pushEnabled,
    },
    create: {
      userId: input.userId,
      clinicId: input.clinicId,
      defaultReminderTiming: input.defaultReminderTiming,
      pushEnabled: input.pushEnabled,
    },
  });

  return {
    defaultReminderTiming: preference.defaultReminderTiming as ReminderTimingOption,
    pushEnabled: preference.pushEnabled,
  };
}

export async function registerDevicePushToken(input: {
  userId: string;
  clinicId: string;
  expoPushToken: string;
  deviceId: string;
}): Promise<{ id: string; expoPushToken: string; deviceId: string }> {
  if (!isValidExpoPushToken(input.expoPushToken)) {
    throw new InvalidPushTokenError();
  }

  const token = await prisma.devicePushToken.upsert({
    where: {
      userId_clinicId_deviceId: {
        userId: input.userId,
        clinicId: input.clinicId,
        deviceId: input.deviceId,
      },
    },
    update: {
      expoPushToken: input.expoPushToken,
    },
    create: {
      userId: input.userId,
      clinicId: input.clinicId,
      expoPushToken: input.expoPushToken,
      deviceId: input.deviceId,
    },
  });

  return {
    id: token.id,
    expoPushToken: token.expoPushToken,
    deviceId: token.deviceId,
  };
}

export async function getDevicePushTokens(input: {
  userId: string;
  clinicId: string;
}): Promise<{ id: string; expoPushToken: string; deviceId: string }[]> {
  const tokens = await prisma.devicePushToken.findMany({
    where: {
      userId: input.userId,
      clinicId: input.clinicId,
    },
  });

  return tokens.map((token) => ({
    id: token.id,
    expoPushToken: token.expoPushToken,
    deviceId: token.deviceId,
  }));
}
