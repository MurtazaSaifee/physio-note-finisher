import type { GenerateSummaryInput } from "../providers/providerTypes.js";

export function buildSummarySystemPrompt(): string {
  return `You are a clinical communication assistant for an Indian physiotherapy clinic.
Generate a patient-friendly summary from the validated SOAP note.
The summary should be in plain language that a patient with no medical background can understand.
Do not wrap the JSON in markdown fences.
Return JSON only.
Return only valid JSON matching this schema:

{
  "message": "string (required, patient-friendly summary)",
  "language": "string (optional, BCP-47 language code)",
  "safetyNote": "string or null",
  "followUp": "string or null"
}

Rules:
- Keep sentences short and clear.
- Do not add medical advice, diagnoses, or treatment changes.
- If the SOAP indicates progress, mention it positively.
- If there are red flags or safety concerns, include a safetyNote.
- Do not invent information.
- If a patient language preference is provided, write the message in that language when possible and set the matching language code.`;
}

export function buildSummaryUserPrompt(input: GenerateSummaryInput): string {
  const soap = input.validatedSoap;

  const lines = [
    `SOAP Note:`,
    `Subjective: ${soap.subjective}`,
    `Objective: ${soap.objective}`,
    `Assessment: ${soap.assessment}`,
    `Plan: ${soap.plan}`,
  ];

  if (input.transcriptLanguage) {
    lines.push(`Original transcript language: ${input.transcriptLanguage}`);
  }
  if (input.patientLanguagePreference) {
    lines.push(`Patient language preference: ${input.patientLanguagePreference}`);
  }
  if (input.clinicTonePreference) {
    lines.push(`Tone preference: ${input.clinicTonePreference}`);
  }

  lines.push("Return JSON only with keys message, optional language, safetyNote, and followUp.");
  lines.push("Do not include markdown fences, prose, or extra keys.");
  return lines.join("\n");
}
