import { prisma } from "../../data/prismaClient.js";
import * as noteService from "../notes/noteService.js";
import type { SoapSections } from "../../../../shared/contracts/notes.js";
import type { SoapSectionKey } from "../../../../shared/contracts/notes.js";
import {
  generatedSoapSectionsSchema,
  regeneratedSoapSectionsSchema,
} from "./soapGenerationSchemas.js";
import { runWithRepairLoop } from "./withRepairLoop.js";
import type {
  ClinicalNoteProvider,
  SoapNoteDraft,
} from "./providers/providerTypes.js";
import {
  getVoiceJobStatus,
  markVoiceJobSucceeded,
  saveVoiceJobSoapDraft,
  type VoiceJobRecord,
  type VoiceJobStore,
} from "./voiceJobService.js";

function isStrictVoiceRuntime(): boolean {
  return process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
}

type PriorNoteContext = {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
};

function sanitizePromptText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

function summarizePriorNotes(priorNotes: PriorNoteContext[]): string {
  if (priorNotes.length === 0) {
    return "No prior session context available.";
  }

  const latest = priorNotes[0];
  return `Prior context: ${latest?.assessment ?? latest?.subjective ?? "Follow prior plan."}`;
}

function buildDraftFromTranscript(input: {
  transcriptText: string;
  priorSummary: string;
}): SoapSections {
  const transcript = sanitizePromptText(input.transcriptText);
  const prior = sanitizePromptText(input.priorSummary);

  return {
    subjective: `Patient reports: ${transcript}`,
    objective: `Observed findings from recap: ${transcript}`,
    assessment: `Clinical impression: ${prior}`,
    plan: "Continue treatment progression and review response next visit.",
  };
}

function normalizeSoapDraftToSections(draft: SoapNoteDraft): SoapSections {
  return {
    subjective: draft.subjective ?? "",
    objective: draft.objective ?? "",
    assessment: draft.assessment ?? "",
    plan: draft.plan ?? "",
  };
}

function buildRegeneratedSection(input: {
  section: SoapSectionKey;
  transcriptText: string;
  hint?: string;
  priorSummary: string;
}): string {
  const transcript = sanitizePromptText(input.transcriptText);
  const hint = sanitizePromptText(input.hint ?? "");
  const prior = sanitizePromptText(input.priorSummary);

  if (input.section === "plan") {
    return `Continue plan from recap: ${transcript}. ${hint ? `Clinician hint: ${hint}. ` : ""}Include home exercise progression and next review.`;
  }

  if (input.section === "assessment") {
    return `Clinical impression: ${prior}. ${hint ? `Refinement: ${hint}.` : ""}`.trim();
  }

  if (input.section === "objective") {
    return `Objective findings from recap: ${transcript}. ${hint ? `Focus: ${hint}.` : ""}`.trim();
  }

  return `Patient-reported symptoms: ${transcript}. ${hint ? `Focus: ${hint}.` : ""}`.trim();
}

async function listPriorNotes(
  clinicId: string,
  patientId: string,
  sessionId: string,
): Promise<PriorNoteContext[]> {
  return prisma.progressNote.findMany({
    where: {
      clinicId,
      patientId,
      sessionId: {
        not: sessionId,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      subjective: true,
      objective: true,
      assessment: true,
      plan: true,
    },
    take: 3,
  });
}

export interface GenerateSoapDraftOptions {
  clinicId: string;
  patientId: string;
  userId: string;
  sessionId?: string;
  transcriptText: string;
  priorNotes?: PriorNoteContext[];
  provider?: ClinicalNoteProvider | undefined;
}

export async function generateSoapDraft(input: GenerateSoapDraftOptions) {
  const priorNotes =
    input.priorNotes ??
    (input.sessionId
      ? await listPriorNotes(input.clinicId, input.patientId, input.sessionId)
      : []);

  // If a ClinicalNoteProvider is injected, use it instead of the deterministic builder
  if (input.provider) {
    const generateFn = async () => {
      const draft = await input.provider!.generateSoapDraft({
        transcript: input.transcriptText,
        priorNotes: priorNotes.map((n) => ({
          subjective: n.subjective,
          objective: n.objective,
          assessment: n.assessment,
          plan: n.plan,
        })),
      });

      return normalizeSoapDraftToSections(draft);
    };

    const generatedSections = await runWithRepairLoop(
      generateFn,
      generatedSoapSectionsSchema,
      "soap",
    );

    if (!input.sessionId) {
      return { sections: generatedSections };
    }

    const sessionWithNote = await prisma.session.findFirst({
      where: {
        id: input.sessionId,
        clinicId: input.clinicId,
        patientId: input.patientId,
      },
      select: {
        progressNote: { select: { id: true } },
      },
    });

    let saved;
    if (!sessionWithNote?.progressNote) {
      saved = await noteService.createNoteForExistingSession({
        clinicId: input.clinicId,
        patientId: input.patientId,
        sessionId: input.sessionId,
        userId: input.userId,
        sections: generatedSections,
      });
    } else {
      saved = await noteService.saveManualNote({
        clinicId: input.clinicId,
        patientId: input.patientId,
        sessionId: input.sessionId,
        userId: input.userId,
        input: {
          sections: generatedSections,
        },
      });
    }

    return {
      sessionId: saved.sessionId,
      patientId: saved.patientId,
      sections: generatedSoapSectionsSchema.parse(saved.sections),
    };
  }

  // Deterministic fallback (existing behavior)
  const generatedSections = await runWithRepairLoop(
    async () =>
      buildDraftFromTranscript({
        transcriptText: input.transcriptText,
        priorSummary: summarizePriorNotes(priorNotes),
      }),
    generatedSoapSectionsSchema,
    "soap",
  );

  if (!input.sessionId) {
    return {
      sections: generatedSections,
    };
  }

  const sessionWithNote = await prisma.session.findFirst({
    where: {
      id: input.sessionId,
      clinicId: input.clinicId,
      patientId: input.patientId,
    },
    select: {
      progressNote: { select: { id: true } },
    },
  });

  let saved;
  if (!sessionWithNote?.progressNote) {
    saved = await noteService.createNoteForExistingSession({
      clinicId: input.clinicId,
      patientId: input.patientId,
      sessionId: input.sessionId,
      userId: input.userId,
      sections: generatedSections,
    });
  } else {
    saved = await noteService.saveManualNote({
      clinicId: input.clinicId,
      patientId: input.patientId,
      sessionId: input.sessionId,
      userId: input.userId,
      input: {
        sections: generatedSections,
      },
    });
  }

  return {
    sessionId: saved.sessionId,
    patientId: saved.patientId,
    sections: generatedSoapSectionsSchema.parse(saved.sections),
  };
}

export async function regenerateSoapSection(input: {
  clinicId: string;
  patientId: string;
  userId: string;
  sessionId?: string;
  transcriptText: string;
  targetSection: SoapSectionKey;
  currentSections: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  hint?: string;
}) {
  const priorNotes =
    input.sessionId
      ? await listPriorNotes(input.clinicId, input.patientId, input.sessionId)
      : [];
  const nextSections = {
    ...input.currentSections,
    [input.targetSection]: buildRegeneratedSection({
      section: input.targetSection,
      transcriptText: input.transcriptText,
      priorSummary: summarizePriorNotes(priorNotes),
      ...(input.hint ? { hint: input.hint } : {}),
    }),
  };
  const validatedSections = await runWithRepairLoop(
    async () => nextSections,
    regeneratedSoapSectionsSchema,
    "soap",
  );

  if (!input.sessionId) {
    return {
      regeneratedSection: input.targetSection,
      sections: validatedSections,
    };
  }

  const saved = await noteService.saveManualNote({
    clinicId: input.clinicId,
    patientId: input.patientId,
    sessionId: input.sessionId,
    userId: input.userId,
    input: {
      sections: validatedSections,
    },
  });

  return {
    sessionId: saved.sessionId,
    patientId: saved.patientId,
    regeneratedSection: input.targetSection,
    sections: regeneratedSoapSectionsSchema.parse(saved.sections),
  };
}

/**
 * Worker-stage SOAP generation: reads transcript from the voice job,
 * calls the clinical note provider, saves the SOAP draft to the job record,
 * and marks the stage as succeeded.
 * Local/test runtimes may still fall back without a provider; managed runtimes
 * require a real provider and a valid SOAP draft before success.
 */
export async function runSoapGeneration(
  store: VoiceJobStore,
  jobId: string,
  clinicId: string,
  provider?: ClinicalNoteProvider,
): Promise<VoiceJobRecord> {
  if (!provider && isStrictVoiceRuntime()) {
    throw new Error("Clinical note provider is required for SOAP generation in managed runtimes");
  }

  if (provider) {
    const job = await getVoiceJobStatus(store, jobId, clinicId);

    if (!job.transcript?.text?.trim()) {
      throw new Error("SOAP generation requires a transcript");
    }

    const draft = await provider.generateSoapDraft({
      transcript: job.transcript.text,
    });
    const validatedDraft = generatedSoapSectionsSchema.parse(
      normalizeSoapDraftToSections(draft),
    );

    // Persist SOAP draft as JSON string in the voice job
    const soapJson = JSON.stringify(validatedDraft);
    await saveVoiceJobSoapDraft(store, jobId, clinicId, soapJson);
  }

  const persisted = await getVoiceJobStatus(store, jobId, clinicId);
  if (isStrictVoiceRuntime() && !persisted.soapDraft?.trim()) {
    throw new Error("SOAP generation stage cannot succeed without a SOAP draft");
  }

  return markVoiceJobSucceeded(store, jobId, clinicId);
}
