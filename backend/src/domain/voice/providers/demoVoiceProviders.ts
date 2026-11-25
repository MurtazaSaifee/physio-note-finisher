import type {
  ClinicalNoteProvider,
  PatientSummaryProvider,
  SoapNoteDraft,
  SttProvider,
} from "./providerTypes.js";

/**
 * Deterministic, offline voice providers for local development and demos.
 *
 * They let the full record → transcript → SOAP draft → patient summary flow run
 * with no API keys, no network and no speech-to-text install. Output is
 * synthetic and clearly labelled; it never leaves the machine.
 */

export const DEMO_TRANSCRIPT =
  "Follow-up for the left ACL reconstruction, now about eight weeks post-op. " +
  "Pain is two out of ten at rest and four after the stairs at work, and the home programme " +
  "has been done most days. On exam, knee flexion is 120 degrees and extension is full, " +
  "there is a small effusion, single-leg squat shows mild valgus, and gait is normal without aids. " +
  "Plan is to progress closed-chain strengthening, start stationary bike intervals and " +
  "single-leg balance work, hold off on running, and review in two weeks.";

const DEMO_SOAP: SoapNoteDraft = {
  subjective:
    "Left knee pain 2/10 at rest, 4/10 after stairs, ~8 weeks after ACL reconstruction. " +
    "Reports good adherence to the home exercise programme.",
  objective:
    "Knee flexion 120°, full extension. Small effusion. Mild dynamic valgus on single-leg squat. " +
    "Normal gait without aids.",
  assessment:
    "Progressing as expected for this stage post-ACL reconstruction. " +
    "Neuromuscular control is the main remaining limitation.",
  plan:
    "Progress closed-chain strengthening; add stationary bike intervals and single-leg balance work. " +
    "No running yet. Review in 2 weeks.",
};

function buildFallbackSoap(transcript: string): SoapNoteDraft {
  return {
    subjective: `Local SOAP subjective: ${transcript}`,
    objective: `Local SOAP objective: ${transcript}`,
    assessment: "Local SOAP assessment: continue physiotherapy and monitor response.",
    plan: "Local SOAP plan: continue exercises and review progress next visit.",
  };
}

export function createDemoSttProvider(): SttProvider {
  return {
    async transcribe(audioBuffer) {
      const durationSeconds = Math.max(1, Math.round(audioBuffer.length / 16_000));
      return {
        requestId: "demo-stt",
        transcript: DEMO_TRANSCRIPT,
        languageCode: "en-IN",
        languageProbability: 1,
        segments: [
          { startTimeSeconds: 0, endTimeSeconds: durationSeconds, text: DEMO_TRANSCRIPT },
        ],
      };
    },
  };
}

export function createDemoClinicalNoteProvider(): ClinicalNoteProvider {
  return {
    async generateSoapDraft(input) {
      const transcript = input.transcript.trim();
      return transcript === DEMO_TRANSCRIPT ? { ...DEMO_SOAP } : buildFallbackSoap(transcript);
    },
  };
}

export function createDemoPatientSummaryProvider(): PatientSummaryProvider {
  return {
    async generatePatientSummary(input) {
      const subjective = input.validatedSoap.subjective.trim();
      if (subjective === DEMO_SOAP.subjective) {
        return {
          message:
            "Your knee is healing well. Keep doing your exercises every day, add the exercise " +
            "bike and balance work, and please don't start running until we review it together.",
          language: "en-IN",
          safetyNote:
            "Contact the clinic if the knee becomes hot, very swollen or suddenly more painful.",
          followUp: "Next visit in 2 weeks.",
        };
      }
      return {
        message: `Local patient summary: ${subjective || "continue the agreed plan and return next visit."}`,
        language: "en-IN",
        safetyNote: null,
        followUp: "Local follow-up: continue the home program and review progress next visit.",
      };
    },
  };
}
