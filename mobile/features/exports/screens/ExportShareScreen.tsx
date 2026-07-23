import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { usePriorSession, usePatientProfile } from "../../patients/hooks/usePatients";
import { useGetProfile } from "../../settings/api/useGetProfile";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { MeridianButton, MeridianEmptyState } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { formatClinicalDate } from "../../ui/formatClinicalDate";
import {
  copyFinalNote,
  saveFullNotePdfToRecord,
  shareFullNotePdf,
  sharePatientSummaryPdf,
  sharePatientSummaryText,
} from "../exportDocumentService";
import { useCreateExportRecord } from "../hooks/useExportRecords";
import { getUserSafeAlertCopy } from "../../ui/userFacingErrors";

type ExportMode = "fullNote" | "patientSummary";
const EMPTY_EXPORT_SECTIONS = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
} as const;

type ExportShareScreenProps = {
  patientId: string;
  sessionId: string;
  clinicId?: string;
  noteStatus: "draft" | "finalized" | "reopened";
  patientName?: string;
  patientDateOfBirth?: string;
  patientRecordId?: string;
  visitDate?: string;
  visitType?: string;
  clinicianName?: string;
  clinicianLicense?: string;
  finalNote?: string;
  patientSummary?: string;
  sections?: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  onBack?: () => void;
};

export function ExportShareScreen({
  patientId,
  sessionId,
  clinicId,
  noteStatus,
  patientName,
  patientDateOfBirth,
  patientRecordId,
  visitDate,
  visitType,
  clinicianName,
  clinicianLicense,
  finalNote,
  patientSummary,
  sections,
  onBack,
}: ExportShareScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<ExportMode>("fullNote");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const patientProfileQuery = usePatientProfile(patientId);
  const priorSessionQuery = usePriorSession(patientId, sessionId);
  const profileQuery = useGetProfile();
  const createExportRecord = useCreateExportRecord(clinicId);

  const resolvedPatientName = patientName ?? patientProfileQuery.data?.fullName ?? "Patient";
  const resolvedDateOfBirth =
    formatClinicalDate(patientDateOfBirth ?? patientProfileQuery.data?.dateOfBirth) ?? "";
  const resolvedRecordId = patientRecordId?.trim() || undefined;
  const resolvedVisitDate =
    formatClinicalDate(visitDate ?? priorSessionQuery.data?.sessionDate) ?? "";
  const resolvedVisitType = visitType ?? priorSessionQuery.data?.visitType ?? "Session";
  const resolvedClinicianName =
    clinicianName ??
    (profileQuery.data
      ? `${profileQuery.data.firstName} ${profileQuery.data.lastName}`.trim()
      : "Clinician");
  const resolvedClinicianLicense = clinicianLicense ?? "On file";
  const resolvedFinalNote = finalNote ?? priorSessionQuery.data?.finalNote ?? "";
  const resolvedSummary = patientSummary ?? priorSessionQuery.data?.patientSummary ?? "";
  const resolvedSections = sections ?? EMPTY_EXPORT_SECTIONS;

  const isFullNoteReady =
    resolvedFinalNote.trim().length > 0 ||
    Object.values(resolvedSections).some((value) => value.trim().length > 0);
  const isSummaryReady = resolvedSummary.trim().length > 0;

  async function recordExportAction(input: {
    patientId: string;
    sessionId: string;
    action: "saved" | "shared" | "copied";
    type: "fullNote" | "patientSummary";
    format: "pdf" | "text";
  }) {
    return createExportRecord.createExportRecord({
      patientId: input.patientId,
      sessionId: input.sessionId,
      input: {
        action: input.action,
        type: input.type,
        format: input.format,
      },
    });
  }

  async function runAction(
    actionKey: string,
    action: () => Promise<unknown>,
    successMessage?: string,
  ): Promise<void> {
    if (pendingAction) {
      return;
    }

    setPendingAction(actionKey);
    try {
      await action();
      if (successMessage) {
        Alert.alert("Saved", successMessage);
      }
    } catch (err) {
      const alertCopy = getUserSafeAlertCopy(err);
      Alert.alert(alertCopy.title, alertCopy.message);
    } finally {
      setPendingAction(null);
    }
  }

  if (noteStatus !== "finalized") {
    return (
      <View style={styles.blockedState}>
        <MeridianScreenHeader
          title="Export & Share"
          subtitle="Review the finalized note before sharing it."
          onBack={onBack ?? (() => undefined)}
          backTestID="export-share-back-button"
          variant="task"
        />
        <View style={styles.centeredState}>
          <Text style={styles.stateTitle}>Export & Share is only available after finalization.</Text>
        </View>
      </View>
    );
  }

  const isLoading =
    patientProfileQuery.isLoading || priorSessionQuery.isLoading || profileQuery.isLoading;
  const isError = patientProfileQuery.isError || priorSessionQuery.isError || profileQuery.isError;
  const retryQueries = () => {
    void Promise.all([
      patientProfileQuery.refetch(),
      priorSessionQuery.refetch(),
      profileQuery.refetch(),
    ]);
  };

  if (isLoading || isError) {
    return (
      <View style={styles.blockedState}>
        <MeridianScreenHeader
          title="Export & Share"
          subtitle="Choose the export format and delivery method."
          onBack={onBack ?? (() => undefined)}
          backTestID="export-share-back-button"
          variant="task"
        />
        <View style={styles.centeredState}>
          <MeridianEmptyState
            title={isLoading ? "Preparing export" : "Export data unavailable"}
            message={
              isLoading
                ? "Loading the patient, session, and clinician details."
                : "We could not load the details needed for export. Check the connection and try again."
            }
            action={
              isError ? (
                <MeridianButton
                  label="Try again"
                  variant="secondary"
                  onPress={retryQueries}
                  testID="export-share-retry-button"
                />
              ) : undefined
            }
            testID={isLoading ? "export-share-loading" : "export-share-error"}
          />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <MeridianScreenHeader
          title="Export & Share"
          subtitle="Choose the export format and delivery method."
          onBack={onBack ?? (() => undefined)}
          backTestID="export-share-back-button"
          variant="task"
        />
      </View>

      <View style={styles.previewShell}>
        <View style={styles.previewCard}>
          <Text style={styles.patientName}>{resolvedPatientName}</Text>
          {resolvedDateOfBirth || resolvedRecordId ? (
            <Text style={styles.patientMeta}>
              {[resolvedDateOfBirth ? `DOB: ${resolvedDateOfBirth}` : null, resolvedRecordId ? `Record: ${resolvedRecordId}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
          <Text style={styles.visitMeta}>{resolvedVisitDate}</Text>
          <Text style={styles.visitType}>{resolvedVisitType}</Text>
          <Text style={styles.previewBody}>
            {mode === "fullNote"
              ? resolvedFinalNote || "Preparing the finalized note for export."
              : resolvedSummary || "Preparing the patient summary for export."}
          </Text>
        </View>
      </View>

      <View style={styles.modeRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Full Note export mode" accessibilityHint="Shows actions for the full finalized note." accessibilityState={{ selected: mode === "fullNote" }} onPress={() => setMode("fullNote")} testID="export-share-full-note-mode-chip" style={[styles.modeChip, mode === "fullNote" ? styles.modeChipActive : null]}>
          <Text style={mode === "fullNote" ? styles.modeChipTextActive : styles.modeChipText}>Full Note</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Patient Summary export mode" accessibilityHint="Shows actions for the patient-facing summary." accessibilityState={{ selected: mode === "patientSummary" }} onPress={() => setMode("patientSummary")} testID="export-share-patient-summary-mode-chip" style={[styles.modeChip, mode === "patientSummary" ? styles.modeChipActive : null]}>
          <Text style={mode === "patientSummary" ? styles.modeChipTextActive : styles.modeChipText}>Patient Summary</Text>
        </Pressable>
      </View>

      {mode === "fullNote" ? (
        <View style={styles.actionsColumn}>
          <MeridianButton
            label={pendingAction === "share-pdf" ? "Sharing..." : "Share PDF"}
            disabled={!isFullNoteReady || pendingAction !== null}
            onPress={() =>
              void runAction(
                "share-pdf",
                () =>
                  shareFullNotePdf({
                    patientId,
                    sessionId,
                    noteStatus,
                    finalNote: resolvedFinalNote,
                    patientName: resolvedPatientName,
                    patientDateOfBirth: resolvedDateOfBirth,
                    ...(resolvedRecordId ? { patientRecordId: resolvedRecordId } : {}),
                    visitDate: resolvedVisitDate,
                    visitType: resolvedVisitType,
                    clinicianName: resolvedClinicianName,
                    clinicianLicense: resolvedClinicianLicense,
                    sections: resolvedSections,
                    recordExportAction,
                  }),
              )
            }
            testID="export-share-share-pdf-button"
          />
          <View style={styles.secondaryGrid}>
            <MeridianButton
              label="Copy Note"
              variant="secondary"
              disabled={!isFullNoteReady || pendingAction !== null}
              onPress={() =>
                void runAction("copy-note", () =>
                  copyFinalNote({
                    finalNote: resolvedFinalNote,
                    patientId,
                    sessionId,
                    recordExportAction,
                  }),
                )
              }
              testID="export-share-copy-note-button"
            />
            <MeridianButton
              label={pendingAction === "export-pdf" ? "Saving..." : "Save as PDF"}
              variant="secondary"
              disabled={!isFullNoteReady || pendingAction !== null}
              onPress={() =>
                void runAction(
                  "export-pdf",
                  () =>
                    saveFullNotePdfToRecord({
                      patientId,
                      sessionId,
                      noteStatus,
                      finalNote: resolvedFinalNote,
                      patientName: resolvedPatientName,
                      patientDateOfBirth: resolvedDateOfBirth,
                      ...(resolvedRecordId ? { patientRecordId: resolvedRecordId } : {}),
                      visitDate: resolvedVisitDate,
                      visitType: resolvedVisitType,
                      clinicianName: resolvedClinicianName,
                      clinicianLicense: resolvedClinicianLicense,
                      sections: resolvedSections,
                      recordExportAction,
                    }),
                  "PDF saved to device and recorded.",
                )
              }
              testID="export-share-export-pdf-button"
            />
          </View>
        </View>
      ) : (
        <View style={styles.actionsColumn}>
          <MeridianButton
            label="Share Summary Text"
            variant="primary"
            disabled={!isSummaryReady || pendingAction !== null}
            onPress={() =>
              void runAction("share-summary-text", () =>
                sharePatientSummaryText({
                  patientId,
                  sessionId,
                  noteStatus,
                  patientName: resolvedPatientName,
                  visitDate: resolvedVisitDate,
                  patientSummary: resolvedSummary,
                  recordExportAction,
                }),
              )
            }
            testID="export-share-share-summary-text-button"
            />
          <MeridianButton
            label="Export Summary PDF"
            variant="secondary"
            disabled={!isSummaryReady || pendingAction !== null}
            onPress={() =>
              void runAction("share-summary-pdf", () =>
                sharePatientSummaryPdf({
                  patientId,
                  sessionId,
                  noteStatus,
                  patientName: resolvedPatientName,
                  visitDate: resolvedVisitDate,
                  patientSummary: resolvedSummary,
                  recordExportAction,
                }),
              )
            }
            testID="export-share-export-summary-pdf-button"
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: meridian.spacing.lg,
    gap: meridian.spacing.lg,
    backgroundColor: meridian.color.surface,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: meridian.spacing.lg,
    backgroundColor: meridian.color.surface,
  },
  blockedState: {
    flex: 1,
    backgroundColor: meridian.color.surface,
  },
  stateTitle: {
    color: meridian.color.text,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButtonSpacer: {
    minWidth: 56,
  },
  headerTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  previewShell: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.dock,
    padding: meridian.spacing.sm,
  },
  previewCard: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.xl,
    gap: meridian.spacing.sm,
    ...meridian.shadow.card,
  },
  patientName: {
    ...typography.heading,
    color: meridian.color.text,
  },
  patientMeta: {
    color: meridian.color.textSubtle,
    fontSize: 12,
  },
  visitMeta: {
    color: meridian.color.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  visitType: {
    color: meridian.color.textSubtle,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  previewBody: {
    color: meridian.color.text,
    fontSize: 14,
    lineHeight: 22,
    marginTop: meridian.spacing.md,
  },
  modeRow: {
    flexDirection: "row",
    gap: meridian.spacing.sm,
  },
  modeChip: {
    flex: 1,
    borderRadius: meridian.radius.card,
    borderWidth: 1,
    borderColor: meridian.color.border,
    paddingVertical: meridian.spacing.md,
    alignItems: "center",
    backgroundColor: meridian.color.surface,
  },
  modeChipActive: {
    backgroundColor: meridian.color.primarySoft,
    borderColor: meridian.color.primary,
  },
  modeChipText: {
    color: meridian.color.textSubtle,
    fontWeight: "600",
  },
  modeChipTextActive: {
    color: meridian.color.primary,
    fontWeight: "600",
  },
  actionsColumn: {
    gap: meridian.spacing.md,
  },
  secondaryGrid: {
    gap: meridian.spacing.sm,
  },
  pressed: {
    opacity: 0.84,
  },
});
