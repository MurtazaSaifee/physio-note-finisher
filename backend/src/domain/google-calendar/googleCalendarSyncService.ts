import { prisma } from "../../data/prismaClient.js";
import { getGoogleCalendarClient } from "./googleCalendarClient.js";

function parseDateTime(dateTime: string | undefined): Date {
  if (!dateTime) {
    return new Date();
  }
  return new Date(dateTime);
}

function calculateDurationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function getExtendedProperty(
  event: Record<string, unknown>,
  key: string,
): string | undefined {
  const extendedProperties = event.extendedProperties as
    | { private?: Record<string, string> }
    | undefined;
  return extendedProperties?.private?.[key];
}

async function reconcileEvent(
  clinicId: string,
  event: Record<string, unknown>,
): Promise<void> {
  const googleEventId = event.id as string;
  const status = event.status as string;

  if (status === "cancelled") {
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        clinicId,
        googleEventId,
      },
    });

    if (existingAppointment) {
      await prisma.appointment.update({
        where: {
          id_clinicId: {
            id: existingAppointment.id,
            clinicId,
          },
        },
        data: {
          status: "cancelled",
          syncStatus: "synced",
        },
      });
    }
    return;
  }

  const physioAppointmentId = getExtendedProperty(event, "physioAppointmentId");
  const physioClinicId = getExtendedProperty(event, "physioClinicId");
  const summary = (event.summary as string) ?? "Unknown patient";
  const startDateTime = parseDateTime((event.start as { dateTime?: string })?.dateTime);
  const endDateTime = parseDateTime((event.end as { dateTime?: string })?.dateTime);
  const durationMinutes = calculateDurationMinutes(startDateTime, endDateTime);

  if (physioAppointmentId && physioClinicId === clinicId) {
    await prisma.appointment.upsert({
      where: {
        id_clinicId: {
          id: physioAppointmentId,
          clinicId,
        },
      },
      create: {
        id: physioAppointmentId,
        clinic: { connect: { id: clinicId } },
        patientNameSnapshot: summary,
        scheduledAt: startDateTime,
        durationMinutes,
        status: "upcoming",
        googleEventId,
        syncStatus: "synced",
      },
      update: {
        patientNameSnapshot: summary,
        scheduledAt: startDateTime,
        durationMinutes,
        googleEventId,
        syncStatus: "synced",
      },
    });
    return;
  }

  const existingByGoogleEventId = await prisma.appointment.findFirst({
    where: {
      clinicId,
      googleEventId,
    },
  });

  if (existingByGoogleEventId) {
    await prisma.appointment.update({
      where: {
        id_clinicId: {
          id: existingByGoogleEventId.id,
          clinicId,
        },
      },
      data: {
        patientNameSnapshot: summary,
        scheduledAt: startDateTime,
        durationMinutes,
        googleEventId,
        syncStatus: "synced",
      },
    });
  } else {
    await prisma.appointment.create({
      data: {
        clinic: { connect: { id: clinicId } },
        patientNameSnapshot: summary,
        scheduledAt: startDateTime,
        durationMinutes,
        status: "upcoming",
        googleEventId,
        syncStatus: "synced",
      },
    });
  }
}

export async function runFullCalendarSync(
  clinicId: string,
  userId: string,
): Promise<void> {
  const calendar = await getGoogleCalendarClient(clinicId, userId);

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 90);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 365);

  const response = await calendar.events.list({
    calendarId: "primary",
    singleEvents: true,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  });

  const events = (response.data.items ?? []) as Record<string, unknown>[];

  for (const event of events) {
    await reconcileEvent(clinicId, event);
  }

  const nextSyncToken = response.data.nextSyncToken ?? null;

  await prisma.googleCalendarConnection.update({
    where: {
      userId_clinicId: {
        userId,
        clinicId,
      },
    },
    data: {
      nextSyncToken,
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
  });
}

export async function runIncrementalCalendarSync(
  clinicId: string,
  userId: string,
): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findFirst({
    where: {
      clinicId,
      userId,
    },
  });

  if (!connection) {
    throw new Error("Google Calendar connection not found");
  }

  if (!connection.nextSyncToken) {
    await runFullCalendarSync(clinicId, userId);
    return;
  }

  const calendar = await getGoogleCalendarClient(clinicId, userId);

  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      singleEvents: true,
      syncToken: connection.nextSyncToken,
    });

    const events = (response.data.items ?? []) as Record<string, unknown>[];

    for (const event of events) {
      await reconcileEvent(clinicId, event);
    }

    const nextSyncToken = response.data.nextSyncToken ?? null;

    await prisma.googleCalendarConnection.update({
      where: {
        userId_clinicId: {
          userId,
          clinicId,
        },
      },
      data: {
        nextSyncToken,
        lastSyncedAt: new Date(),
        lastSyncError: null,
      },
    });
  } catch (error) {
    const apiError = error as { code?: number; message?: string };

    if (apiError.code === 410) {
      await prisma.googleCalendarConnection.update({
        where: {
          userId_clinicId: {
            userId,
            clinicId,
          },
        },
        data: {
          nextSyncToken: null,
          lastSyncError: `Sync token invalidated (410): ${apiError.message ?? "Unknown error"}`,
        },
      });
      return;
    }

    throw error;
  }
}

export async function pushAppointmentToGoogle(
  clinicId: string,
  userId: string,
  appointmentId: string,
): Promise<void> {
  const calendar = await getGoogleCalendarClient(clinicId, userId);

  const appointment = await prisma.appointment.findFirst({
    where: {
      clinicId,
      id: appointmentId,
    },
  });

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  const endTime = new Date(appointment.scheduledAt);
  endTime.setMinutes(endTime.getMinutes() + appointment.durationMinutes);

  const eventData = {
    summary: appointment.patientNameSnapshot ?? "Appointment",
    start: {
      dateTime: appointment.scheduledAt.toISOString(),
    },
    end: {
      dateTime: endTime.toISOString(),
    },
    extendedProperties: {
      private: {
        physioAppointmentId: appointment.id,
        physioClinicId: clinicId,
      },
    },
  };

  let googleEventId: string;

  if (appointment.googleEventId) {
    const response = await calendar.events.update({
      calendarId: "primary",
      eventId: appointment.googleEventId,
      requestBody: eventData,
    });
    googleEventId = response.data.id ?? appointment.googleEventId;
  } else {
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventData,
    });
    googleEventId = response.data.id ?? "";
  }

  await prisma.appointment.update({
    where: {
      id_clinicId: {
        id: appointmentId,
        clinicId,
      },
    },
    data: {
      googleEventId,
      syncStatus: "synced",
      syncedAt: new Date(),
    },
  });
}
