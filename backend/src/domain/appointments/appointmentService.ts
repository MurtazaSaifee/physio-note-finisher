import { Prisma } from "@prisma/client";

import { prisma } from "../../data/prismaClient.js";
import { PatientNotFoundError } from "../patients/patientService.js";
import type {
  AppointmentDetailResponse,
  CreateAppointmentRequest,
  StartSessionFromAppointmentRequest,
  StartSessionFromAppointmentResponse,
  UpdateAppointmentRequest,
} from "../../../../shared/contracts/appointments.js";

export class AppointmentNotFoundError extends Error {
  constructor() {
    super("Appointment not found");
    this.name = "AppointmentNotFoundError";
  }
}

export class AppointmentUnavailableError extends Error {
  constructor() {
    super("Appointment is not available for session start");
    this.name = "AppointmentUnavailableError";
  }
}

type AppointmentRow = Prisma.AppointmentGetPayload<{
  select: {
    id: true;
    clinicId: true;
    patientId: true;
    patientNameSnapshot: true;
    scheduledAt: true;
    durationMinutes: true;
    status: true;
    linkedSessionId: true;
    notes: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

function parseIsoDate(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date value");
  }

  return parsed;
}

function buildReminderText(patientName: string, scheduledAt: Date): string {
  const month = scheduledAt.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = scheduledAt.getUTCDate();
  const year = scheduledAt.getUTCFullYear();
  let hour = scheduledAt.getUTCHours();
  const minute = scheduledAt.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const timeStr = `${hour}:${minute} ${ampm}`;
  return `You have an appointment with ${patientName} on ${month} ${day}, ${year} at ${timeStr}.`;
}

async function resolvePatientName(
  clinicId: string,
  patientId: string | null,
  patientNameSnapshot: string | null,
): Promise<string> {
  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: {
        clinicId,
        id: patientId,
      },
      select: {
        fullName: true,
      },
    });

    if (patient) {
      return patient.fullName;
    }
  }

  return patientNameSnapshot ?? "Unknown patient";
}

function toDetail(
  row: AppointmentRow,
  patientName: string,
): AppointmentDetailResponse {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    patientName,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status,
    linkedSessionId: row.linkedSessionId,
    reminderText: buildReminderText(patientName, row.scheduledAt),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureAppointmentExists(
  clinicId: string,
  appointmentId: string,
): Promise<void> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      clinicId,
      id: appointmentId,
    },
    select: {
      id: true,
    },
  });

  if (!appointment) {
    throw new AppointmentNotFoundError();
  }
}

export async function createAppointment(input: {
  clinicId: string;
  input: CreateAppointmentRequest;
}): Promise<AppointmentDetailResponse> {
  const { patientId, patientNameSnapshot, scheduledAt, durationMinutes, notes } =
    input.input;

  let resolvedPatientName: string | null = null;

  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: {
        clinicId: input.clinicId,
        id: patientId,
      },
      select: {
        id: true,
        fullName: true,
      },
    });

    if (!patient) {
      throw new PatientNotFoundError();
    }

    resolvedPatientName = patient.fullName;
  }

  const data: Prisma.AppointmentCreateInput = {
    clinic: {
      connect: {
        id: input.clinicId,
      },
    },
    patientNameSnapshot: patientNameSnapshot ?? null,
    scheduledAt: parseIsoDate(scheduledAt),
    durationMinutes,
    status: "upcoming",
    notes: notes ?? null,
  };

  if (patientId) {
    data.patient = {
      connect: {
        id_clinicId: {
          id: patientId,
          clinicId: input.clinicId,
        },
      },
    };
  }

  const appointment = await prisma.appointment.create({
    data,
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      patientNameSnapshot: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      linkedSessionId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const patientName = resolvedPatientName ?? patientNameSnapshot ?? "Unknown patient";
  return toDetail(appointment, patientName);
}

export async function updateAppointment(input: {
  clinicId: string;
  appointmentId: string;
  input: UpdateAppointmentRequest;
}): Promise<AppointmentDetailResponse> {
  await ensureAppointmentExists(input.clinicId, input.appointmentId);

  const data: Prisma.AppointmentUpdateInput = {};

  if (input.input.patientId !== undefined) {
    if (input.input.patientId === null) {
      data.patient = { disconnect: true };
    } else {
      const patient = await prisma.patient.findFirst({
        where: {
          clinicId: input.clinicId,
          id: input.input.patientId,
        },
        select: {
          id: true,
        },
      });

      if (!patient) {
        throw new PatientNotFoundError();
      }

      data.patient = {
        connect: {
          id_clinicId: {
            id: input.input.patientId,
            clinicId: input.clinicId,
          },
        },
      };
    }
  }

  if (input.input.scheduledAt !== undefined) {
    data.scheduledAt = parseIsoDate(input.input.scheduledAt);
  }

  if (input.input.durationMinutes !== undefined) {
    data.durationMinutes = input.input.durationMinutes;
  }

  if (input.input.notes !== undefined) {
    data.notes = input.input.notes;
  }

  const appointment = await prisma.appointment.update({
    where: {
      id_clinicId: {
        id: input.appointmentId,
        clinicId: input.clinicId,
      },
    },
    data,
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      patientNameSnapshot: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      linkedSessionId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const patientName = await resolvePatientName(
    input.clinicId,
    appointment.patientId,
    appointment.patientNameSnapshot,
  );
  return toDetail(appointment, patientName);
}

export async function rescheduleAppointment(input: {
  clinicId: string;
  appointmentId: string;
  scheduledAt: string;
}): Promise<AppointmentDetailResponse> {
  await ensureAppointmentExists(input.clinicId, input.appointmentId);

  const appointment = await prisma.appointment.update({
    where: {
      id_clinicId: {
        id: input.appointmentId,
        clinicId: input.clinicId,
      },
    },
    data: {
      scheduledAt: parseIsoDate(input.scheduledAt),
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      patientNameSnapshot: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      linkedSessionId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const patientName = await resolvePatientName(
    input.clinicId,
    appointment.patientId,
    appointment.patientNameSnapshot,
  );
  return toDetail(appointment, patientName);
}

export async function cancelAppointment(input: {
  clinicId: string;
  appointmentId: string;
}): Promise<AppointmentDetailResponse> {
  await ensureAppointmentExists(input.clinicId, input.appointmentId);

  const appointment = await prisma.appointment.update({
    where: {
      id_clinicId: {
        id: input.appointmentId,
        clinicId: input.clinicId,
      },
    },
    data: {
      status: "cancelled",
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      patientNameSnapshot: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      linkedSessionId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const patientName = await resolvePatientName(
    input.clinicId,
    appointment.patientId,
    appointment.patientNameSnapshot,
  );
  return toDetail(appointment, patientName);
}

export async function listActiveAppointments(input: {
  clinicId: string;
  date?: string;
  timezoneOffset?: string;
}): Promise<AppointmentDetailResponse[]> {
  const where: Prisma.AppointmentWhereInput = {
    clinicId: input.clinicId,
    status: {
      in: ["upcoming", "completed"],
    },
  };

  if (input.date) {
    const offset = input.timezoneOffset ?? "+05:30";
    const start = new Date(`${input.date}T00:00:00${offset}`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    where.scheduledAt = {
      gte: start,
      lt: end,
    };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    orderBy: {
      scheduledAt: "asc",
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      patientNameSnapshot: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      linkedSessionId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const results: AppointmentDetailResponse[] = [];

  for (const appointment of appointments) {
    const patientName = await resolvePatientName(
      input.clinicId,
      appointment.patientId,
      appointment.patientNameSnapshot,
    );
    results.push(toDetail(appointment, patientName));
  }

  return results;
}

export async function getAppointmentHistory(input: {
  clinicId: string;
  limit?: number;
}): Promise<AppointmentDetailResponse[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: input.clinicId,
      status: {
        in: ["cancelled", "missed"],
      },
    },
    orderBy: {
      scheduledAt: "desc",
    },
    take: input.limit ?? 50,
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      patientNameSnapshot: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      linkedSessionId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const results: AppointmentDetailResponse[] = [];

  for (const appointment of appointments) {
    const patientName = await resolvePatientName(
      input.clinicId,
      appointment.patientId,
      appointment.patientNameSnapshot,
    );
    results.push(toDetail(appointment, patientName));
  }

  return results;
}

export async function getAppointmentDetail(input: {
  clinicId: string;
  appointmentId: string;
}): Promise<AppointmentDetailResponse> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      clinicId: input.clinicId,
      id: input.appointmentId,
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      patientNameSnapshot: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      linkedSessionId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!appointment) {
    throw new AppointmentNotFoundError();
  }

  const patientName = await resolvePatientName(
    input.clinicId,
    appointment.patientId,
    appointment.patientNameSnapshot,
  );
  return toDetail(appointment, patientName);
}

export async function startSessionFromAppointment(input: {
  clinicId: string;
  appointmentId: string;
  input: StartSessionFromAppointmentRequest;
}): Promise<StartSessionFromAppointmentResponse> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      clinicId: input.clinicId,
      id: input.appointmentId,
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      scheduledAt: true,
      status: true,
      linkedSessionId: true,
    },
  });

  if (!appointment) {
    throw new AppointmentNotFoundError();
  }

  const patientId = appointment.patientId;

  if (appointment.linkedSessionId && patientId) {
    return {
      appointmentId: appointment.id,
      sessionId: appointment.linkedSessionId,
      patientId,
      linkedSessionId: appointment.linkedSessionId,
    };
  }

  if (appointment.status !== "upcoming") {
    throw new AppointmentUnavailableError();
  }

  if (!patientId) {
    throw new PatientNotFoundError();
  }

  const sessionId = await prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        clinic: {
          connect: {
            id: input.clinicId,
          },
        },
        patient: {
          connect: {
            id_clinicId: {
              id: patientId,
              clinicId: input.clinicId,
            },
          },
        },
        startedAt: appointment.scheduledAt,
        visitType: input.input.sessionType.trim(),
        noteStatus: "draft",
      },
      select: {
        id: true,
      },
    });

    const updated = await tx.appointment.updateMany({
      where: {
        id: appointment.id,
        clinicId: input.clinicId,
        status: "upcoming",
        linkedSessionId: null,
      },
      data: {
        linkedSessionId: session.id,
      },
    });

    if (updated.count !== 1) {
      throw new AppointmentUnavailableError();
    }

    return session.id;
  });

  return {
    appointmentId: appointment.id,
    sessionId,
    patientId,
    linkedSessionId: sessionId,
  };
}

export async function markStaleAppointmentsMissed(input: {
  clinicId: string;
  now?: Date;
}): Promise<{ count: number }> {
  const reference = input.now ?? new Date();
  const graceThreshold = new Date(reference.getTime() - 15 * 60 * 1000);

  const staleAppointments = await prisma.appointment.findMany({
    where: {
      clinicId: input.clinicId,
      status: "upcoming",
      scheduledAt: {
        lt: graceThreshold,
      },
    },
    select: {
      id: true,
    },
  });

  if (staleAppointments.length === 0) {
    return { count: 0 };
  }

  const result = await prisma.appointment.updateMany({
    where: {
      id: {
        in: staleAppointments.map((a) => a.id),
      },
    },
    data: {
      status: "missed",
    },
  });

  return { count: result.count };
}
