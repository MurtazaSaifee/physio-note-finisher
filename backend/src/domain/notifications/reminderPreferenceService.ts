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

function isValidTiming(value: string): value is ReminderTimingOption {
  return VALID_TIMING_OPTIONS.includes(value as ReminderTimingOption);
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
