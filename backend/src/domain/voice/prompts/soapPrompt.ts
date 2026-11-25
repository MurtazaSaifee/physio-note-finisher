import type { GenerateSoapInput } from "../providers/providerTypes.js";

export function buildSoapSystemPrompt(): string {
  return `You are a clinical documentation assistant for an Indian physiotherapy clinic.
Generate a structured SOAP note from the provided transcript and context.
Do not invent facts. If information is missing, use "Not mentioned" for text fields.
Do not wrap the JSON in markdown fences.
Return JSON only.
Return only valid JSON matching this schema:

{
  "subjective": "string",
  "objective": "string",
  "assessment": "string",
  "plan": "string",
  "metadata": {
    "language": "string (optional)",
    "confidence": ""high" | "medium" | "low" (optional)",
    "missingInformation": ["string", "..."] (optional),
    "requiresClinicianReview": "boolean (optional)"
  }
}

Rules:
- The note is a draft for clinician review.
- Do not diagnose beyond the provided clinical context.
- Do not add medications unless explicitly mentioned.
- Do not add exercises unless mentioned or clearly requested.
- Preserve uncertainty.
- Use concise clinical language.
- Set metadata.requiresClinicianReview to true when the transcript is incomplete, ambiguous, or clinically risky.
- Use metadata.missingInformation only for genuinely missing details that would matter during clinician review.`;
}

export function buildSoapUserPrompt(input: GenerateSoapInput): string {
  const parts: string[] = [];

  if (input.patientDemographics) {
    const { age, sex, conditionTags } = input.patientDemographics;
    const demos: string[] = [];
    if (age !== undefined) demos.push(`${age}y`);
    if (sex) demos.push(sex);
    if (conditionTags && conditionTags.length > 0) demos.push(`Conditions: ${conditionTags.join(", ")}`);
    if (demos.length > 0) parts.push(`Patient: ${demos.join(" ")}`);
  }

  if (input.priorNotes && input.priorNotes.length > 0) {
    const prior = input.priorNotes[0];
    const priorText = prior?.assessment ?? prior?.subjective ?? "Follow prior plan.";
    parts.push(`Prior context: ${priorText}`);
  }

  const transcript = input.correctedTranscript ?? input.transcript;
  parts.push(`Transcript: ${transcript}`);

  if (input.templateHints && input.templateHints.length > 0) {
    parts.push(`Hints: ${input.templateHints.join("; ")}`);
  }

  if (input.clinicPreferences) {
    parts.push(`Clinic preferences: ${input.clinicPreferences}`);
  }

  parts.push("Return JSON only with keys subjective, objective, assessment, plan, and optional metadata.");
  parts.push("Do not include markdown fences, prose, or extra keys.");
  return parts.join("\n\n");
}
