import type { FastifyReply } from "fastify";

import {
  assertPatientAiConsent,
  PatientConsentRequiredError,
} from "../../domain/voice/voiceConsentService.js";

/**
 * Gate for every route that sends clinical text or audio to an AI provider.
 * Replies 403 `patient_consent_required` and returns false when the patient has
 * no active AI-processing consent; the caller must stop handling the request.
 */
export async function requirePatientAiConsent(
  clinicId: string,
  patientId: string,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    await assertPatientAiConsent({ clinicId, patientId });
    return true;
  } catch (error) {
    if (error instanceof PatientConsentRequiredError) {
      await reply.code(403).send({ error: error.errorCode });
      return false;
    }
    throw error;
  }
}
