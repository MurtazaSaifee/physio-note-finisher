import { Prisma } from "@prisma/client";

import { prisma } from "../../data/prismaClient.js";
import { SessionNotFoundError } from "./sessionTimelineService.js";
import type {
  CopyForwardScaffold,
  CopyForwardSection,
} from "../../../../shared/contracts/sessions.js";

export { SessionNotFoundError };

type SourceSessionRow = Prisma.SessionGetPayload<{
  select: {
    id: true;
    clinicId: true;
    patientId: true;
    startedAt: true;
    priorPlan: true;
    carryForwardContext: true;
  };
}>;

function toScaffold(
  session: SourceSessionRow,
  selectedSections: CopyForwardSection[],
): CopyForwardScaffold {
  const selected = new Set(selectedSections);

  return {
    patientId: session.patientId,
    sourceSessionId: session.id,
    selectedSections,
    priorPlan: selected.has("priorPlan") ? session.priorPlan : null,
    carryForwardContext: selected.has("carryForwardContext")
      ? session.carryForwardContext
      : null,
    sourceSessionDate: session.startedAt.toISOString(),
  };
}

export async function copyForwardFromSession(input: {
  clinicId: string;
  patientId: string;
  sourceSessionId: string;
  selectedSections: CopyForwardSection[];
}): Promise<CopyForwardScaffold> {
  const session = await prisma.session.findFirst({
    where: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      id: input.sourceSessionId,
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      startedAt: true,
      priorPlan: true,
      carryForwardContext: true,
    },
  });

  if (!session) {
    throw new SessionNotFoundError();
  }

  return toScaffold(session, input.selectedSections);
}
