import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { MeridianCard, MeridianButton, MeridianEmptyState, MeridianInput, MeridianRow, MeridianStatusPill, MeridianChip } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";

import type {
  PatientProfileResponse,
  RecentSessionStatus,
  UpdatePatientRequest,
} from "../../../../shared/contracts/patients";
import { TimelineCard } from "../components/TimelineCard";
import {
  useArchivePatient,
  usePatientProfile,
  usePatientTimeline,
  useUpdatePatient,
} from "../hooks/usePatients";
import { useExportRecords } from "../../exports/hooks/useExportRecords";
import { useDebouncedValue } from "../../search/useDebouncedValue";
import { getUserSafeAlertCopy } from "../../ui/userFacingErrors";

type PatientSexDraft =
  | ""
  | "female"
  | "male"
  | "other"
  | "prefer_not_to_say";

type PatientProfileScreenProps = {
  patientId?: string;
  clinicId?: string;
  onBack?: () => void;
  onStartNewSession?: (patientId: string) => void;
  onOpenSession?: (patientId: string, sessionId: string) => void;
  onOpenFinalizedRecord?: (patientId: string, sessionId: string) => void;
  onCreateAppointment?: (patientId: string) => void;
};

type ProfileDraft = {
  fullName: string;
  dateOfBirth: string;
  sex: PatientSexDraft;
  phone: string;
  email: string;
  addressLine: string;
  clinicalNotes: string;
};


function draftFromProfile(profile: PatientProfileResponse): ProfileDraft {
  return {
    fullName: profile.fullName,
    dateOfBirth: profile.dateOfBirth ?? "",
    sex: (profile.sex ?? "") as PatientSexDraft,
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    addressLine: profile.addressLine ?? "",
    clinicalNotes: profile.clinicalNotes ?? "",
  };
}

function buildUpdatePatientInput(draft: ProfileDraft): UpdatePatientRequest {
  const input: UpdatePatientRequest = {
    fullName: draft.fullName.trim(),
  };

  input.dateOfBirth = draft.dateOfBirth.trim().length > 0 ? draft.dateOfBirth.trim() : null;
  input.sex = draft.sex || null;
  input.phone = draft.phone.trim().length > 0 ? draft.phone.trim() : null;
  input.email = draft.email.trim().length > 0 ? draft.email.trim() : null;
  input.addressLine =
    draft.addressLine.trim().length > 0 ? draft.addressLine.trim() : null;
  input.clinicalNotes =
    draft.clinicalNotes.trim().length > 0 ? draft.clinicalNotes.trim() : null;

  return input;
}

function formatRecentSessionStatus(status: RecentSessionStatus): string {
  if (status === "draft") {
    return "Draft";
  }

  if (status === "reopened") {
    return "Reopened";
  }

  if (status === "finalized") {
    return "Finalized";
  }

  return "Not recorded";
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function PatientProfileScreen({
  patientId,
  clinicId,
  onBack,
  onStartNewSession,
  onOpenSession,
  onOpenFinalizedRecord,
  onCreateAppointment,
}: PatientProfileScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const profileQuery = usePatientProfile(patientId);
  const timelineQuery = usePatientTimeline(patientId);
  const exportRecordsQuery = useExportRecords(patientId, clinicId);
  const updatePatient = useUpdatePatient();
  const archivePatient = useArchivePatient();

  const [draft, setDraft] = useState<ProfileDraft>({
    fullName: "",
    dateOfBirth: "",
    sex: "",
    phone: "",
    email: "",
    addressLine: "",
    clinicalNotes: "",
  });
  const [showEdit, setShowEdit] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const hasInitialized = useRef(false);
  const previousPatientIdRef = useRef(patientId);

  if (previousPatientIdRef.current !== patientId) {
    previousPatientIdRef.current = patientId;
    hasInitialized.current = false;
    setShowEdit(false);
  }

  if (profileQuery.data && !hasInitialized.current) {
    setDraft(draftFromProfile(profileQuery.data));
    hasInitialized.current = true;
  }

  const archived = Boolean(profileQuery.data?.archivedAt);
  const canSave = useMemo(() => draft.fullName.trim().length > 0, [draft.fullName]);
  const canInteract = Boolean(patientId?.trim());
  const latestEditableSession = timelineQuery.data?.items.find(
    (item) => item.noteStatus === "draft" || item.noteStatus === "reopened",
  );

  async function handleSave(): Promise<void> {
    if (!patientId || !canSave) {
      return;
    }

    try {
      await updatePatient.mutateAsync({
        patientId,
        input: buildUpdatePatientInput(draft),
      });
    } catch (err) {
      const alertCopy = getUserSafeAlertCopy(err);
      Alert.alert(alertCopy.title, alertCopy.message);
    }
  }

  async function handleArchiveToggle(): Promise<void> {
    if (!patientId) {
      return;
    }

    try {
      await archivePatient.mutateAsync({
        patientId,
        archived: !archived,
      });
    } catch (err) {
      const alertCopy = getUserSafeAlertCopy(err);
      Alert.alert(alertCopy.title, alertCopy.message);
    }
  }

  function confirmArchive(): void {
    Alert.alert(
      "Archive patient?",
      "This patient record will leave normal patient views. You can restore it later from archived patients.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive patient",
          style: "destructive",
          onPress: () => void handleArchiveToggle(),
        },
      ],
    );
  }

  if (!canInteract) {
    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.screen}
      >
        <MeridianScreenHeader
          title="Patient Profile"
          subtitle="Select a patient to review continuity context."
          {...(onBack ? { onBack, backTestID: "patient-profile-back-button" } : {})}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.scrollView}
      contentContainerStyle={[styles.screen, { paddingBottom: meridian.spacing.xl + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <MeridianScreenHeader
        title="Patient Profile"
        subtitle="Minimal identity, contact, and continuity context."
        {...(onBack ? { onBack, backTestID: "patient-profile-back-button" } : {})}
      />

      <View style={styles.surfaceSection}>
        {profileQuery.isLoading ? (
          <Text style={styles.emptyText}>Loading profile...</Text>
        ) : profileQuery.data ? (
          <>
            <View style={styles.profileHeaderRow}>
              <View style={styles.profileHeadingBlock}>
                <Text style={styles.patientName}>{profileQuery.data.fullName}</Text>
                <Text style={styles.metaText}>
                  {archived ? "Archived patient" : "Active patient"}
                </Text>
              </View>
              <MeridianStatusPill status={archived ? "archived" : "neutral"} label={archived ? "Archived" : "Active"} />
            </View>

            <View style={styles.infoRow}>
              <InfoCard label="Date of birth" value={profileQuery.data.dateOfBirth ?? "Not set"} />
              <InfoCard label="Sex" value={profileQuery.data.sex ?? "Not set"} />
            </View>
            <InfoCard label="Phone" value={profileQuery.data.phone ?? "Not set"} />
            <InfoCard label="Email" value={profileQuery.data.email ?? "Not set"} />
            <InfoCard
              label="Address"
              value={profileQuery.data.addressLine ?? "Not set"}
            />
            <View style={styles.indicatorRow}>
              <InfoCard
                label="Recent status"
                value={formatRecentSessionStatus(profileQuery.data.recentSessionStatus)}
              />
              <InfoCard
                label="Upcoming"
                value={profileQuery.data.nextAppointment ?? "No upcoming visit"}
              />
            </View>
            {profileQuery.data.conditionTags.length > 0 ? (
              <View style={styles.tagRow}>
                {profileQuery.data.conditionTags.slice(0, 2).map((tag) => (
                  <Text key={`${profileQuery.data?.id}-${tag}`} style={styles.tagLabel}>
                    {tag}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.buttonStack}>
              {latestEditableSession ? (
                <MeridianButton
                  label="Resume latest draft"
                  variant="primary"
                  onPress={() =>
                    onOpenSession?.(
                      latestEditableSession.patientId,
                      latestEditableSession.id,
                    )
                  }
                  testID="patient-profile-resume-latest-draft-button"
                />
              ) : null}
              <MeridianButton
                label="Start documentation"
                variant={latestEditableSession ? "secondary" : "primary"}
                onPress={() => {
                  if (patientId) {
                    onStartNewSession?.(patientId);
                  }
                }}
                disabled={!patientId}
                testID="patient-profile-new-session-button"
              />
              <MeridianRow
                title="View history"
                subtitle="Review prior sessions and finalized notes."
                onPress={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                testID="patient-profile-view-history-row"
                trailingLabel="Open"
              />
              <MeridianRow
                title="Schedule a visit"
                subtitle="Choose a time and link it to this patient."
                onPress={() => {
                  if (patientId) {
                    onCreateAppointment?.(patientId);
                  }
                }}
                testID="patient-profile-create-appointment-row"
                trailingLabel="Open"
              />
              <MeridianRow
                title="Edit patient"
                subtitle="Update identity and contact details."
                onPress={() => setShowEdit(true)}
                testID="patient-profile-edit-row"
                trailingLabel="Open"
              />
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>Patient record unavailable.</Text>
        )}
      </View>

      {showEdit ? (
        <View style={styles.surfaceSection}>
          <Text style={styles.sectionLabel}>Edit patient</Text>
        <MeridianInput
          placeholder="Full name"
          value={draft.fullName}
          onChangeText={(value) => setDraft((current) => ({ ...current, fullName: value }))}
          testID="patient-profile-fullname-input"
        />
        <MeridianInput
          placeholder="Date of birth"
          value={draft.dateOfBirth}
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, dateOfBirth: value }))
          }
          testID="patient-profile-dob-input"
        />
        <MeridianInput
          placeholder="Sex"
          value={draft.sex}
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, sex: value as PatientSexDraft }))
          }
          testID="patient-profile-sex-input"
        />
        <MeridianInput
          placeholder="Phone"
          value={draft.phone}
          onChangeText={(value) => setDraft((current) => ({ ...current, phone: value }))}
          testID="patient-profile-phone-input"
        />
        <MeridianInput
          placeholder="Email"
          value={draft.email}
          onChangeText={(value) => setDraft((current) => ({ ...current, email: value }))}
          keyboardType="email-address"
          autoCapitalize="none"
          testID="patient-profile-email-input"
        />
        <MeridianInput
          placeholder="Address"
          value={draft.addressLine}
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, addressLine: value }))
          }
          testID="patient-profile-address-input"
        />
        <MeridianInput
          placeholder="Clinical notes"
          value={draft.clinicalNotes}
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, clinicalNotes: value }))
          }
          multiline
          style={styles.textArea}
          testID="patient-profile-clinical-notes-input"
        />

        <View style={styles.buttonStack}>
          <MeridianButton
            label={updatePatient.isPending ? "Saving..." : "Save changes"}
            variant="primary"
            onPress={() => void handleSave()}
            disabled={updatePatient.isPending || !canSave}
            testID="patient-profile-save-button"
          />

          <MeridianButton
            label={
              archivePatient.isPending
                ? "Updating..."
                : archived
                  ? "Restore patient"
                  : "Archive patient"
            }
            variant="destructive"
            onPress={() => {
              if (archived) {
                void handleArchiveToggle();
                return;
              }
              confirmArchive();
            }}
            disabled={archivePatient.isPending}
            testID="patient-profile-archive-button"
          />
        </View>
        </View>
      ) : null}

      <View style={styles.surfaceSection}>
        <Text style={styles.sectionLabel}>Clinical Records</Text>
        <ClinicalRecordsSection
          patientId={patientId}
          clinicId={clinicId}
          timelineQuery={timelineQuery}
          exportRecordsQuery={exportRecordsQuery}
          onOpenFinalizedRecord={onOpenFinalizedRecord}
        />
      </View>

      <View style={styles.surfaceSection}>
        <Text style={styles.sectionLabel}>Session timeline</Text>
        {timelineQuery.isLoading ? (
          <Text style={styles.emptyText}>Loading timeline...</Text>
        ) : timelineQuery.isError ? (
          <MeridianEmptyState
            title="Timeline unavailable"
            message="We could not load this patient's session history. Check the connection and try again."
            action={(
              <MeridianButton
                label="Try again"
                variant="secondary"
                onPress={() => void timelineQuery.refetch()}
                testID="patient-profile-timeline-retry-button"
              />
            )}
            testID="patient-profile-timeline-error"
          />
        ) : timelineQuery.data?.items.length ? (
          <View style={styles.timelineList}>
            {timelineQuery.data.items.map((item, index) => (
              <TimelineCard
                key={item.id}
                item={item}
                testID={`patient-profile-timeline-${index}-card`}
                statusTestID={`patient-profile-timeline-${index}-status-pill`}
                onOpenSession={(timelinePatientId, sessionId) => {
                  if (item.noteStatus === "finalized") {
                    onOpenFinalizedRecord?.(timelinePatientId, sessionId);
                    return;
                  }
                  onOpenSession?.(timelinePatientId, sessionId);
                }}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No sessions recorded yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

type ClinicalRecordsSectionProps = {
  patientId?: string | undefined;
  clinicId?: string | undefined;
  timelineQuery: ReturnType<typeof usePatientTimeline>;
  exportRecordsQuery: ReturnType<typeof useExportRecords>;
  onOpenFinalizedRecord?: ((patientId: string, sessionId: string) => void) | undefined;
};

function ClinicalRecordsSection({
  patientId,
  clinicId,
  timelineQuery,
  exportRecordsQuery,
  onOpenFinalizedRecord,
}: ClinicalRecordsSectionProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const finalizedRecords = useMemo(() => {
    const items = timelineQuery.data?.items ?? [];
    return items
      .filter((item) => item.noteStatus === "finalized")
      .sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
  }, [timelineQuery.data?.items]);

  const exportRecordMap = useMemo(() => {
    const records = exportRecordsQuery.data?.records ?? [];
    const map = new Map<string, { saved: boolean; shared: boolean }>();
    for (const record of records) {
      const existing = map.get(record.sessionId) ?? { saved: false, shared: false };
      if (record.action === "saved") existing.saved = true;
      if (record.action === "shared") existing.shared = true;
      map.set(record.sessionId, existing);
    }
    return map;
  }, [exportRecordsQuery.data?.records]);

  const filteredRecords = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return finalizedRecords;

    return finalizedRecords.filter((item) => {
      const haystack = [
        item.visitType,
        item.finalNotePreview,
        item.patientSummaryPreview,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [finalizedRecords, debouncedSearch]);

  if (timelineQuery.isLoading) {
    return <MeridianEmptyState title="Loading records" message="Your finalized clinical records will appear here." testID="patient-profile-records-loading" />;
  }

  if (timelineQuery.isError) {
    return (
      <MeridianEmptyState
        title="Clinical records unavailable"
        message="We could not load the finalized records. Check the connection and try again."
        action={(
          <MeridianButton
            label="Try again"
            variant="secondary"
            onPress={() => void timelineQuery.refetch()}
            testID="patient-profile-records-retry-button"
          />
        )}
        testID="patient-profile-records-error"
      />
    );
  }

  if (finalizedRecords.length === 0) {
    return <MeridianEmptyState title="No finalized notes yet" message="Finalized notes will appear here when documentation is complete." testID="patient-profile-records-empty" />;
  }

  return (
    <View style={styles.recordsSection}>
      <MeridianInput
        placeholder="Search records..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        testID="patient-profile-record-search-input"
      />

      <View style={styles.recordsList}>
        {filteredRecords.map((item, index) => {
          const status = exportRecordMap.get(item.id);
          const hasExportStatus = status?.saved || status?.shared;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.visitType} record`}
              accessibilityHint="Opens the full finalized note."
              testID={`patient-profile-record-${index}-card`}
              onPress={() => {
                if (patientId) {
                  onOpenFinalizedRecord?.(patientId, item.id);
                }
              }}
              style={({ pressed }) => [
                pressed ? styles.recordRowPressed : null,
              ]}
            >
              <MeridianCard>
                <View style={styles.recordRow}>
                  <View style={styles.recordInfo}>
                    <Text style={styles.recordDate}>
                      {new Date(item.sessionDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Text>
                    <Text style={styles.recordVisitType}>{item.visitType}</Text>
                    {hasExportStatus ? (
                      <View style={styles.statusRow}>
                        {status?.saved ? (
                          <MeridianChip label="Saved export" />
                        ) : null}
                        {status?.shared ? (
                          <MeridianChip label="Shared export" />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                  <MeridianStatusPill
                    status="finalized"
                    label="Finalized"
                    testID={`patient-profile-record-${index}-status-pill`}
                  />
                  <Text
                    style={styles.recordOpenCue}
                    testID={`patient-profile-record-${index}-open-cue`}
                  >
                    Open
                  </Text>
                </View>
              </MeridianCard>
            </Pressable>
          );
        })}
      </View>

      {filteredRecords.length === 0 && debouncedSearch.trim().length > 0 ? (
        <MeridianEmptyState title="No matching records" message="Try a different search term." testID="patient-profile-records-no-match" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  screen: {
    flexGrow: 1,
    padding: 20,
    gap: 16,
    backgroundColor: meridian.color.surface,
  },
  hero: {
    gap: 6,
  },
  title: {
    ...typography.display,
    color: meridian.color.text,
    marginBottom: meridian.spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  surfaceSection: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    gap: meridian.spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  profileHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  profileHeadingBlock: {
    flex: 1,
    gap: 4,
  },
  patientName: {
    ...typography.heading,
    color: meridian.color.text,
  },
  metaText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  infoRow: {
    flexDirection: "row",
    gap: 12,
  },
  indicatorRow: {
    flexDirection: "row",
    gap: 12,
  },
  infoCard: {
    flex: 1,
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: 14,
    gap: 6,
  },
  infoLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  infoValue: {
    ...typography.body,
    fontWeight: "600",
    color: meridian.color.text,
  },
  textArea: {
    minHeight: 108,
    textAlignVertical: "top",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: meridian.spacing.xs,
  },
  tagLabel: {
    ...typography.label,
    color: meridian.color.primary,
    backgroundColor: meridian.color.primarySoft,
    borderRadius: meridian.radius.chip,
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
  },
  buttonStack: {
    gap: meridian.spacing.sm,
  },
  timelineList: {
    gap: 12,
  },
  emptyText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  recordsSection: {
    gap: meridian.spacing.md,
  },
  recordsList: {
    gap: meridian.spacing.sm,
  },
  recordRowPressed: {
    opacity: 0.8,
  },
  recordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: meridian.spacing.sm,
  },
  recordInfo: {
    flex: 1,
    gap: 4,
  },
  recordDate: {
    ...typography.label,
    color: meridian.color.textSubtle,
    letterSpacing: 0.8,
    fontSize: 11,
  },
  recordVisitType: {
    ...typography.heading,
    color: meridian.color.text,
  },
  recordOpenCue: {
    ...typography.label,
    color: meridian.color.primary,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: meridian.spacing.xs,
  },
});
