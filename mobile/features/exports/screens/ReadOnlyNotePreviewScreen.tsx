import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useManualNote } from "../../notes/hooks/useNotes";
import { usePriorSession, usePatientProfile } from "../../patients/hooks/usePatients";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { MeridianButton, MeridianEmptyState, MeridianStatusPill } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { formatClinicalDate } from "../../ui/formatClinicalDate";

type ReadOnlyNotePreviewScreenProps = {
  patientId: string;
  sessionId: string;
  onOpenExportShare?: (input: {
    patientId: string;
    sessionId: string;
    patientSummary: string;
    sections: {
      subjective: string;
      objective: string;
      assessment: string;
      plan: string;
    };
  }) => void;
  onCreateNewDraftFromSession?: () => void;
  onBack?: () => void;
};

export function ReadOnlyNotePreviewScreen({
  patientId,
  sessionId,
  onOpenExportShare,
  onCreateNewDraftFromSession,
  onBack,
}: ReadOnlyNotePreviewScreenProps): React.JSX.Element {
  const patientProfileQuery = usePatientProfile(patientId);
  const priorSessionQuery = usePriorSession(patientId, sessionId);
  const noteQuery = useManualNote(patientId, sessionId);

  const session = priorSessionQuery.data;
  const patientName = patientProfileQuery.data?.fullName ?? "Patient";

  const hasFinalNote = Boolean(session?.finalNote && session.finalNote.trim().length > 0);
  const hasSummary = Boolean(session?.patientSummary && session.patientSummary.trim().length > 0);
  const formattedSessionDate = formatClinicalDate(session?.sessionDate);
  const isLoading =
    patientProfileQuery.isLoading || priorSessionQuery.isLoading || noteQuery.isLoading;
  const isError = patientProfileQuery.isError || priorSessionQuery.isError || noteQuery.isError;
  const retryQueries = () => {
    void Promise.all([
      patientProfileQuery.refetch(),
      priorSessionQuery.refetch(),
      noteQuery.refetch(),
    ]);
  };

  if (isLoading || isError) {
    return (
      <View style={styles.stateScreen}>
        <MeridianScreenHeader
          title="Note Preview"
          subtitle="Read the finalized note before exporting or sharing."
          onBack={onBack ?? (() => undefined)}
          backTestID="read-only-preview-back-button"
          variant="task"
        />
        <MeridianEmptyState
          title={isLoading ? "Preparing note preview" : "Note preview unavailable"}
          message={
            isLoading
              ? "Loading the patient and finalized note details."
              : "We could not load the patient or finalized note. Check the connection and try again."
          }
          action={
            isError ? (
              <MeridianButton
                label="Try again"
                variant="secondary"
                onPress={retryQueries}
                testID="read-only-preview-retry-button"
              />
            ) : undefined
          }
          testID={isLoading ? "read-only-preview-loading" : "read-only-preview-error"}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <MeridianScreenHeader
          title="Note Preview"
          subtitle="Read the finalized note before exporting or sharing."
          onBack={onBack ?? (() => undefined)}
          backTestID="read-only-preview-back-button"
          variant="task"
        />
      </View>

      <View style={styles.metaCard}>
        <Text style={styles.patientName}>{patientName}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Visit type</Text>
          <Text style={styles.metaValue}>{session?.visitType ?? "—"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Session date</Text>
          <Text style={styles.metaValue}>
            {formattedSessionDate ?? "—"}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Status</Text>
          <MeridianStatusPill status={session?.noteStatus ?? "neutral"} label={session?.noteStatus ?? "—"} />
        </View>
      </View>

      {hasFinalNote ? (
        <View style={styles.contentCard}>
          <Text style={styles.sectionLabel}>Final note</Text>
          <Text style={styles.noteBody}>{session?.finalNote}</Text>
        </View>
      ) : null}

      {hasSummary ? (
        <View style={styles.contentCard}>
          <Text style={styles.sectionLabel}>Patient summary</Text>
          <Text style={styles.noteBody}>{session?.patientSummary}</Text>
        </View>
      ) : null}

      {session?.noteStatus === "finalized" ? (
        <View style={styles.actionArea}>
          <MeridianButton
            label="Export & Share"
            variant="primary"
            onPress={() => {
              onOpenExportShare?.({
                patientId,
                sessionId,
                patientSummary: session?.patientSummary ?? "",
                sections: {
                  subjective: noteQuery.data?.sections?.subjective ?? "",
                  objective: noteQuery.data?.sections?.objective ?? "",
                  assessment: noteQuery.data?.sections?.assessment ?? "",
                  plan: noteQuery.data?.sections?.plan ?? "",
                },
              });
            }}
            testID="read-only-preview-export-button"
          />
          <MeridianButton
            label="Create new draft from this session"
            variant="secondary"
            accessibilityLabel="Create new draft from this session"
            disabled={!onCreateNewDraftFromSession}
            {...(onCreateNewDraftFromSession ? { onPress: onCreateNewDraftFromSession } : {})}
            testID="read-only-preview-create-draft-button"
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: meridian.spacing.lg,
    gap: meridian.spacing.lg,
    backgroundColor: meridian.color.surface,
  },
  stateScreen: {
    flex: 1,
    padding: meridian.spacing.lg,
    gap: meridian.spacing.lg,
    backgroundColor: meridian.color.surface,
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
  metaCard: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.lg,
    gap: meridian.spacing.sm,
  },
  patientName: {
    ...typography.heading,
    color: meridian.color.text,
    fontSize: 20,
    marginBottom: meridian.spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: meridian.spacing.sm,
  },
  metaLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  metaValue: {
    ...typography.body,
    color: meridian.color.text,
    fontWeight: "600",
  },
  contentCard: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.lg,
    gap: meridian.spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  noteBody: {
    ...typography.body,
    color: meridian.color.text,
    lineHeight: 22,
  },
  actionArea: {
    marginTop: meridian.spacing.sm,
    gap: meridian.spacing.sm,
  },
});
