import { Prisma } from "@prisma/client";

import { prisma } from "../../data/prismaClient.js";
import type {
  AuditEventMetadata,
  AuditEventType,
  AuditHistoryResponse,
} from "../../../../shared/contracts/audit.js";

export async function createAuditEvent(input: {
  eventType: AuditEventType;
  sessionId: string;
  userId: string;
  clinicId: string;
  metadata?: AuditEventMetadata | null;
}): Promise<void> {
  const metadata =
    input.metadata === undefined || input.metadata === null
      ? Prisma.DbNull
      : (input.metadata as Prisma.InputJsonValue);

  await prisma.auditEvent.create({
    data: {
      eventType: input.eventType,
      sessionId: input.sessionId,
      userId: input.userId,
      clinicId: input.clinicId,
      metadata,
    },
  });
}

export async function getAuditHistoryForSession(input: {
  sessionId: string;
  clinicId: string;
}): Promise<AuditHistoryResponse> {
  const events = await prisma.auditEvent.findMany({
    where: {
      sessionId: input.sessionId,
      clinicId: input.clinicId,
    },
    orderBy: {
      timestamp: "asc",
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return {
    sessionId: input.sessionId,
    events: events.map((event) => {
      const base = {
        id: event.id,
        eventType: event.eventType as AuditEventType,
        sessionId: event.sessionId,
        userId: event.userId,
        timestamp: event.timestamp.toISOString(),
        metadata: event.metadata as AuditEventMetadata | null,
      };

      if (event.user) {
        return {
          ...base,
          user: {
            firstName: event.user.firstName,
            lastName: event.user.lastName,
          },
        };
      }

      return base;
    }),
  };
}
