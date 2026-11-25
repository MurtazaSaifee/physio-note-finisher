import type {
  PatientConsentRecord,
  PatientConsentSource,
} from "../../../../shared/contracts/voice.js";
import { prisma } from "../../data/prismaClient.js";
import { createLogger } from "../../observability/logger.js";

const logger = createLogger({ component: "voiceConsentService" });

export class PatientConsentRequiredError extends Error {
  public readonly statusCode = 403;
  public readonly errorCode = "patient_consent_required";

  constructor() {
    super("patient_consent_required");
    this.name = "PatientConsentRequiredError";
  }
}

export async function assertPatientAiConsent(params: {
  clinicId: string;
  patientId: string;
}): Promise<void> {
  const consent = await prisma.patientConsent.findFirst({
    where: {
      clinicId: params.clinicId,
      patientId: params.patientId,
      type: "recording_ai_processing",
      status: "active",
    },
    select: { id: true },
  });

  if (!consent) {
    logger.warn("voice.consent.required", {
      clinicId: params.clinicId,
      patientId: params.patientId,
    });
    throw new PatientConsentRequiredError();
  }
}

export async function recordPatientAiConsent(params: {
  clinicId: string;
  patientId: string;
  source: PatientConsentSource;
  consentTextVersion: string;
}): Promise<PatientConsentRecord> {
  const now = new Date();

  const consent = await prisma.patientConsent.upsert({
    where: {
      clinicId_patientId_type_status: {
        clinicId: params.clinicId,
        patientId: params.patientId,
        type: "recording_ai_processing",
        status: "active",
      },
    },
    create: {
      clinicId: params.clinicId,
      patientId: params.patientId,
      type: "recording_ai_processing",
      status: "active",
      source: params.source,
      consentTextVersion: params.consentTextVersion,
      consentedAt: now,
    },
    update: {
      source: params.source,
      consentTextVersion: params.consentTextVersion,
      consentedAt: now,
      revokedAt: null,
    },
  });

  logger.info("voice.consent.recorded", {
    consentId: consent.id,
    clinicId: consent.clinicId,
    patientId: consent.patientId,
  });

  return {
    id: consent.id,
    clinicId: consent.clinicId,
    patientId: consent.patientId,
    type: "recording_ai_processing",
    status: "active",
    source: consent.source as PatientConsentSource,
    consentTextVersion: consent.consentTextVersion,
    consentedAt: consent.consentedAt.toISOString(),
    revokedAt: consent.revokedAt?.toISOString() ?? null,
  };
}
