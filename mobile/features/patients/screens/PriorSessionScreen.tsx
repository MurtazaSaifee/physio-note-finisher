import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import {
  MeridianButton,
  MeridianChip,
  MeridianEmptyState,
} from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";

import type {
  CopyForwardScaffold,
  PriorSessionDetailResponse,
} from "../../../../shared/contracts/sessions";
import { PriorSessionPanel } from "../components/PriorSessionPanel";
import { useCopyForward } from "../hooks/useCopyForward";
import { usePriorSession } from "../hooks/usePatients";

type CopyForwardSection = "priorPlan" | "carryForwardContext";

type PriorSessionScreenProps = {
  patientId?: string;
  sessionId?: string;
  onBack?: () => void;
  onScaffoldReady?: (scaffold: CopyForwardScaffold) => void;
};

function getAvailableSections(
  session: PriorSessionDetailResponse,
): CopyForwardSection[] {
  return [
    session.priorPlan?.trim() ? "priorPlan" : null,
    session.carryForwardContext?.trim() ? "carryForwardContext" : null,
  ].filter((section): section is CopyForwardSection => section !== null);
}

function SectionToggle({
  label,
  available,
  loading,
  selected,
  onToggle,
}: {
  label: CopyForwardSection;
  available: boolean;
  loading: boolean;
  selected: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const displayLabel = label === "priorPlan" ? "Prior plan" : "Carry-forward context";

  if (loading) {
    return (
      <View
        accessibilityState={{ disabled: true, selected: false }}
        testID={`prior-session-${label === "priorPlan" ? "prior-plan" : "carry-forward"}-chip`}
      >
        <MeridianChip label={`${displayLabel} loading...`} selected={false} />
      </View>
    );
  }

  if (!available) {
    return (
      <View
        accessibilityState={{ disabled: true, selected: false }}
        testID={`prior-session-${label === "priorPlan" ? "prior-plan" : "carry-forward"}-chip`}
      >
        <MeridianChip label={`${displayLabel} unavailable`} selected={false} />
      </View>
    );
  }

  return (
    <MeridianChip
      label={displayLabel}
      selected={selected}
      onPress={onToggle}
      testID={`prior-session-${label === "priorPlan" ? "prior-plan" : "carry-forward"}-chip`}
    />
  );
}

export function PriorSessionScreen({
  patientId,
  sessionId,
  onBack,
  onScaffoldReady,
}: PriorSessionScreenProps): React.JSX.Element {
  const sessionQuery = usePriorSession(patientId, sessionId);
  const copyForward = useCopyForward();
  const [selectedSections, setSelectedSections] = useState<CopyForwardSection[]>([]);
  const availableSections = sessionQuery.data
    ? getAvailableSections(sessionQuery.data)
    : [];
  const isSessionContentLoading = sessionQuery.isLoading && !sessionQuery.data;
  const isSessionContentError = sessionQuery.isError;

  useEffect(() => {
    if (!sessionQuery.data) {
      return;
    }

    setSelectedSections((current) => {
      const available = getAvailableSections(sessionQuery.data);
      const retained = current.filter((section) => available.includes(section));
      return retained.length > 0 ? retained : available.slice(0, 1);
    });
  }, [sessionQuery.data]);

  const canInteract = Boolean(patientId?.trim()) && Boolean(sessionId?.trim());
  const scaffoldLabel = isSessionContentLoading
    ? "Prior session content is still loading."
    : selectedSections.length > 0
      ? `${selectedSections.length} section${selectedSections.length === 1 ? "" : "s"} selected`
      : availableSections.length > 0
        ? "Select a section to copy."
        : "No sections available to copy.";

  async function handleCopyForward(): Promise<void> {
    if (!patientId || !sessionId || selectedSections.length === 0) {
      return;
    }

    const scaffold = await copyForward.copyForward({
      patientId,
      sessionId,
      selectedSections,
    });
    onScaffoldReady?.(scaffold);
  }

  if (!canInteract) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.hero}>
          <Text style={styles.title}>Prior session</Text>
          <Text style={styles.subtitle}>Open a session from the patient timeline.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <MeridianScreenHeader
        title="Prior Session"
        subtitle="Inspect the record first, then copy selected context forward."
        {...(onBack ? { onBack, backTestID: "prior-session-back-button" } : {})}
      />

      {isSessionContentLoading ? (
        <MeridianEmptyState
          title="Loading prior session..."
          message="Loading prior session details."
          testID="prior-session-loading-state"
        />
      ) : isSessionContentError ? (
        <MeridianEmptyState
          title="Could not load prior session"
          message="Check your connection and try again."
          action={(
            <MeridianButton
              label="Try again"
              variant="secondary"
              onPress={() => void sessionQuery.refetch()}
              testID="prior-session-retry-button"
            />
          )}
          testID="prior-session-error-state"
        />
      ) : sessionQuery.data ? (
        <PriorSessionPanel session={sessionQuery.data} />
      ) : (
        <View style={styles.surfaceSection}>
          <Text style={styles.emptyText}>Prior session unavailable.</Text>
        </View>
      )}

      {!isSessionContentError ? (
        <View style={styles.surfaceSection}>
          <Text style={styles.sectionLabel}>Copy forward</Text>
          <Text style={styles.subtitleInline}>
            Choose the sections to seed the current note scaffold.
          </Text>

          <View style={styles.sectionToggleGroup}>
            <SectionToggle
              label="priorPlan"
              available={availableSections.includes("priorPlan")}
              loading={isSessionContentLoading}
              selected={selectedSections.includes("priorPlan")}
              onToggle={() => {
                if (!availableSections.includes("priorPlan")) {
                  return;
                }

                setSelectedSections((current) =>
                  current.includes("priorPlan")
                    ? current.filter((section) => section !== "priorPlan")
                    : [...current, "priorPlan"],
                )
              }}
            />
            <SectionToggle
              label="carryForwardContext"
              available={availableSections.includes("carryForwardContext")}
              loading={isSessionContentLoading}
              selected={selectedSections.includes("carryForwardContext")}
              onToggle={() => {
                if (!availableSections.includes("carryForwardContext")) {
                  return;
                }

                setSelectedSections((current) =>
                  current.includes("carryForwardContext")
                    ? current.filter((section) => section !== "carryForwardContext")
                    : [...current, "carryForwardContext"],
                )
              }}
            />
          </View>

          <Text style={styles.helperText}>{scaffoldLabel}</Text>

          <View style={styles.buttonContainer}>
            <MeridianButton
              label={copyForward.isPending ? "Copying..." : "Copy forward"}
              variant="primary"
              onPress={() => void handleCopyForward()}
              disabled={
                copyForward.isPending ||
                !sessionQuery.data ||
                selectedSections.length === 0
              }
              testID="prior-session-copy-forward-button"
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
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
  subtitleInline: {
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
    textTransform: "uppercase",
  },
  sectionToggleGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: meridian.spacing.sm,
  },
  helperText: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  buttonContainer: {
    marginTop: meridian.spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
});
