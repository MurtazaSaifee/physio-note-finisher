import { Prisma } from "@prisma/client";

import { prisma } from "../../data/prismaClient.js";
import type {
  DashboardFilters,
  DashboardResponse,
  DashboardSessionCard,
} from "../../../../shared/contracts/dashboard.js";

type DashboardSessionRow = Prisma.SessionGetPayload<{
  select: {
    id: true;
    patientId: true;
    startedAt: true;
    visitType: true;
    noteStatus: true;
    finalNote: true;
    patientSummary: true;
    patient: {
      select: {
        fullName: true;
        conditionTags: true;
      };
    };
    progressNote: {
      select: {
        templateKey: true;
      };
    };
  };
}>;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const UPCOMING_BODY =
  "Appointment details will appear here when calendar scheduling is available.";
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SESSION_CARD_SELECT = {
  id: true,
  patientId: true,
  startedAt: true,
  visitType: true,
  noteStatus: true,
  finalNote: true,
  patientSummary: true,
  patient: {
    select: {
      fullName: true,
      conditionTags: true,
    },
  },
  progressNote: {
    select: {
      templateKey: true,
    },
  },
} satisfies Prisma.SessionSelect;

async function resolveNextUpcomingAppointment(clinicId: string): Promise<{
  id: string;
  patientName: string;
  scheduledAt: Date;
  durationMinutes: number;
} | null> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      clinicId,
      status: "upcoming",
      scheduledAt: {
        gte: new Date(),
      },
    },
    orderBy: {
      scheduledAt: "asc",
    },
    select: {
      id: true,
      patientId: true,
      patientNameSnapshot: true,
      scheduledAt: true,
      durationMinutes: true,
    },
  });

  if (!appointment) {
    return null;
  }

  let patientName = appointment.patientNameSnapshot;

  if (appointment.patientId && !patientName) {
    const patient = await prisma.patient.findFirst({
      where: {
        clinicId,
        id: appointment.patientId,
      },
      select: {
        fullName: true,
      },
    });
    patientName = patient?.fullName ?? "Unknown patient";
  }

  return {
    id: appointment.id,
    patientName: patientName ?? "Unknown patient",
    scheduledAt: appointment.scheduledAt,
    durationMinutes: appointment.durationMinutes,
  };
}

function validateDateString(date: string, timezoneOffset?: string): Date {
  const offset = timezoneOffset ?? "+05:30";
  const parsed = new Date(`${date}T00:00:00${offset}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date format, expected YYYY-MM-DD");
  }
  return parsed;
}

export function buildDateRange(date: string, timezoneOffset?: string): { gte: Date; lt: Date } {
  if (!DATE_REGEX.test(date)) {
    throw new Error("Invalid date format, expected YYYY-MM-DD");
  }

  const start = validateDateString(date, timezoneOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    gte: start,
    lt: end,
  };
}

function toSessionCard(session: DashboardSessionRow): DashboardSessionCard {
  return {
    sessionId: session.id,
    patientId: session.patientId,
    patientName: session.patient.fullName,
    sessionDate: session.startedAt.toISOString(),
    visitType: session.visitType,
    noteStatus: session.noteStatus,
    templateKey: session.progressNote?.templateKey ?? null,
    finalNote: session.finalNote,
    patientSummary: session.patientSummary,
    conditionTags: session.patient.conditionTags,
  };
}

function normalizeSearch(search?: string): string {
  return search?.trim() ?? "";
}

function buildSearchWhere(search?: string): Prisma.SessionWhereInput | undefined {
  const normalizedSearch = normalizeSearch(search);
  if (!normalizedSearch) {
    return undefined;
  }

  const conditionTagCandidates = Array.from(
    new Set([
      normalizedSearch,
      normalizedSearch.toLowerCase(),
      normalizedSearch.toUpperCase(),
      normalizedSearch
        .split(/\s+/)
        .map((part) =>
          part.length > 0
            ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
            : part,
        )
        .join(" "),
    ]),
  );

  return {
    OR: [
      {
        patient: {
          fullName: {
            contains: normalizedSearch,
            mode: "insensitive",
          },
        },
      },
      {
        visitType: {
          contains: normalizedSearch,
          mode: "insensitive",
        },
      },
      {
        finalNote: {
          contains: normalizedSearch,
          mode: "insensitive",
        },
      },
      {
        patientSummary: {
          contains: normalizedSearch,
          mode: "insensitive",
        },
      },
      {
        patient: {
          conditionTags: {
            hasSome: conditionTagCandidates,
          },
        },
      },
    ],
  };
}

export function buildWhere(input: {
  clinicId: string;
  filters: DashboardFilters;
}): Prisma.SessionWhereInput {
  const where: Prisma.SessionWhereInput = {
    clinicId: input.clinicId,
  };

  if (input.filters.patientId) {
    where.patientId = input.filters.patientId;
  }

  if (input.filters.date) {
    where.startedAt = buildDateRange(input.filters.date, input.filters.timezoneOffset);
  }

  if (input.filters.noteStatus && input.filters.noteStatus !== "all") {
    where.noteStatus = input.filters.noteStatus;
  }

  return where;
}

function buildSessionListWhere(input: {
  clinicId: string;
  filters: DashboardFilters;
}): Prisma.SessionWhereInput {
  const baseWhere = buildWhere(input);
  const searchWhere = buildSearchWhere(input.filters.search);

  if (!searchWhere) {
    return baseWhere;
  }

  return {
    AND: [baseWhere, searchWhere],
  };
}

export async function listDashboardSessions(input: {
  clinicId: string;
  filters: DashboardFilters;
}): Promise<DashboardResponse> {
  const page = input.filters.page ?? DEFAULT_PAGE;
  const pageSize = input.filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const search = normalizeSearch(input.filters.search);
  const where = buildSessionListWhere(input);
  const skip = (page - 1) * pageSize;

  const [sessions, total, nextAppointment] = await Promise.all([
    prisma.session.findMany({
      where,
      orderBy: {
        startedAt: "desc",
      },
      skip,
      take: pageSize,
      select: SESSION_CARD_SELECT,
    }),
    prisma.session.count({ where }),
    resolveNextUpcomingAppointment(input.clinicId),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  const filters: DashboardFilters = {
    noteStatus: input.filters.noteStatus ?? "all",
    page,
    pageSize,
  };

  if (input.filters.date !== undefined) {
    filters.date = input.filters.date;
  }

  if (input.filters.timezoneOffset !== undefined) {
    filters.timezoneOffset = input.filters.timezoneOffset;
  }

  if (input.filters.patientId !== undefined) {
    filters.patientId = input.filters.patientId;
  }

  if (search.length > 0) {
    filters.search = search;
  }

  const upcoming: DashboardResponse["upcoming"] = nextAppointment
    ? {
        label: "Upcoming",
        body: UPCOMING_BODY,
        appointmentId: nextAppointment.id,
        patientName: nextAppointment.patientName,
        scheduledAt: nextAppointment.scheduledAt.toISOString(),
        durationMinutes: nextAppointment.durationMinutes,
        visitType: "Follow-up",
      }
    : {
        label: "Upcoming",
        body: UPCOMING_BODY,
      };

  return {
    upcoming,
    recentSessions: sessions.map(toSessionCard),
    filters,
    page,
    pageSize,
    total,
    totalPages,
  };
}
