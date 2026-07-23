import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { Share } from "react-native";
import { printToFileAsync } from "expo-print";
import { shareAsync } from "expo-sharing";

import type { CreateExportRecordRequest, ExportRecordResponse } from "../../../shared/contracts/exports";
import type { NoteStatus } from "../../../shared/contracts/sessions";
import {
  buildFullNoteExportHtml,
  buildPatientSummaryExportHtml,
} from "./exportTemplates";

type FullNoteSections = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type RecordExportAction = (input: {
  patientId: string;
  sessionId: string;
  action: CreateExportRecordRequest["action"];
  type: CreateExportRecordRequest["type"];
  format: CreateExportRecordRequest["format"];
}) => Promise<ExportRecordResponse>;

type FullNoteExportInput = {
  patientId: string;
  sessionId: string;
  noteStatus: NoteStatus;
  finalNote: string;
  patientName: string;
  patientDateOfBirth: string;
  patientRecordId?: string;
  visitDate: string;
  visitType: string;
  clinicianName: string;
  clinicianLicense: string;
  sections: FullNoteSections;
  recordExportAction: RecordExportAction;
};

type PatientSummaryExportInput = {
  patientId: string;
  sessionId: string;
  noteStatus: NoteStatus;
  patientName: string;
  visitDate: string;
  patientSummary: string;
  recordExportAction: RecordExportAction;
};

const CLIPBOARD_CLEAR_DELAY_MS = 120000;

function assertFinalized(noteStatus: NoteStatus): void {
  if (noteStatus !== "finalized") {
    throw new Error("Only finalized notes can be exported");
  }
}

async function renderPdf(html: string): Promise<string> {
  const printed = await printToFileAsync({ html });
  return printed.uri;
}

async function cleanupFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

async function persistPdfToDevice(uri: string, sessionId: string): Promise<void> {
  const documentDirectory = FileSystem.documentDirectory;
  if (!documentDirectory) {
    throw new Error("Document directory unavailable");
  }

  const exportDirectory = `${documentDirectory}Physio Note Finisher`;
  const exportFileUri = `${exportDirectory}/export-${sessionId}-${Date.now()}.pdf`;

  await FileSystem.makeDirectoryAsync(exportDirectory, { intermediates: true });
  await FileSystem.copyAsync({ from: uri, to: exportFileUri });
}

type CopyFinalNoteInput = {
  finalNote: string;
  patientId: string;
  sessionId: string;
  recordExportAction: RecordExportAction;
};

export async function copyFinalNote(input: CopyFinalNoteInput): Promise<string> {
  await Clipboard.setStringAsync(input.finalNote);
  setTimeout(() => {
    void Clipboard.getStringAsync().then((value) => {
      if (value === input.finalNote) {
        return Clipboard.setStringAsync("");
      }
      return undefined;
    });
  }, CLIPBOARD_CLEAR_DELAY_MS);
  await input.recordExportAction({
    patientId: input.patientId,
    sessionId: input.sessionId,
    action: "copied",
    type: "fullNote",
    format: "text",
  });
  return input.finalNote;
}

export async function saveFullNotePdfToRecord(input: FullNoteExportInput): Promise<string> {
  assertFinalized(input.noteStatus);

  const html = buildFullNoteExportHtml({
    patientName: input.patientName,
    patientDateOfBirth: input.patientDateOfBirth,
    ...(input.patientRecordId ? { patientRecordId: input.patientRecordId } : {}),
    visitDate: input.visitDate,
    visitType: input.visitType,
    clinicianName: input.clinicianName,
    clinicianLicense: input.clinicianLicense,
    sections: input.sections,
    finalNote: input.finalNote,
  });
  const fileUri = await renderPdf(html);

  try {
    await persistPdfToDevice(fileUri, input.sessionId);
    await input.recordExportAction({
      patientId: input.patientId,
      sessionId: input.sessionId,
      action: "saved",
      type: "fullNote",
      format: "pdf",
    });
  } finally {
    await cleanupFile(fileUri);
  }

  return fileUri;
}

export async function shareFullNotePdf(input: FullNoteExportInput): Promise<string> {
  assertFinalized(input.noteStatus);

  const html = buildFullNoteExportHtml({
    patientName: input.patientName,
    patientDateOfBirth: input.patientDateOfBirth,
    ...(input.patientRecordId ? { patientRecordId: input.patientRecordId } : {}),
    visitDate: input.visitDate,
    visitType: input.visitType,
    clinicianName: input.clinicianName,
    clinicianLicense: input.clinicianLicense,
    sections: input.sections,
    finalNote: input.finalNote,
  });
  const fileUri = await renderPdf(html);

  try {
    await shareAsync(fileUri);
    // Note: expo-sharing resolves on both successful share and dismissal.
    // The platform does not provide a reliable cancellation signal.
    await input.recordExportAction({
      patientId: input.patientId,
      sessionId: input.sessionId,
      action: "shared",
      type: "fullNote",
      format: "pdf",
    });
  } finally {
    await cleanupFile(fileUri);
  }

  return fileUri;
}

export async function sharePatientSummaryText(input: PatientSummaryExportInput): Promise<string> {
  assertFinalized(input.noteStatus);

  const result = await Share.share({
    message: input.patientSummary,
  });

  if (result.action === Share.sharedAction) {
    await input.recordExportAction({
      patientId: input.patientId,
      sessionId: input.sessionId,
      action: "shared",
      type: "patientSummary",
      format: "text",
    });
  }

  return input.patientSummary;
}

export async function sharePatientSummaryPdf(input: PatientSummaryExportInput): Promise<string> {
  assertFinalized(input.noteStatus);

  const html = buildPatientSummaryExportHtml({
    patientName: input.patientName,
    visitDate: input.visitDate,
    patientSummary: input.patientSummary,
  });
  const fileUri = await renderPdf(html);

  try {
    await shareAsync(fileUri);
    // Note: expo-sharing resolves on both successful share and dismissal.
    // The platform does not provide a reliable cancellation signal.
    await input.recordExportAction({
      patientId: input.patientId,
      sessionId: input.sessionId,
      action: "shared",
      type: "patientSummary",
      format: "pdf",
    });
  } finally {
    await cleanupFile(fileUri);
  }

  return fileUri;
}
