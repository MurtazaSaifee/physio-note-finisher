import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { MeridianCard } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { useAuditHistory } from "../hooks/useAuditHistory";
import type { AuditEventType } from "../../../../shared/contracts/audit";

function eventTypeLabel(eventType: AuditEventType): string {
  const labels: Record<AuditEventType, string> = {
    noteCreated: "Note created",
    sectionEdited: "Section edited",
    sectionRegenerated: "Section regenerated",
    noteFinalized: "Note finalized",
    noteReopened: "Note reopened",
    noteExported: "Note exported",
  };
  return labels[eventType] ?? eventType;
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

function EventRow({
  eventType,
  timestamp,
  clinicianName,
  metadata,
}: {
  eventType: AuditEventType;
  timestamp: string;
  clinicianName: string;
  metadata: Record<string, unknown> | null;
}): React.JSX.Element {
  const sectionName =
    metadata && typeof metadata.sectionName === "string"
      ? metadata.sectionName
      : null;

  return (
    <MeridianCard>
      <View style={styles.eventRow}>
        <View style={styles.eventHeader}>
          <Text style={styles.eventType}>{eventTypeLabel(eventType)}</Text>
          <Text style={styles.timestamp}>{formatTimestamp(timestamp)}</Text>
        </View>
        <Text style={styles.clinicianName}>{clinicianName}</Text>
        {sectionName ? (
          <View style={styles.metadataChip}>
            <Text style={styles.metadataChipText}>
              Section: {sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}
            </Text>
          </View>
        ) : null}
      </View>
    </MeridianCard>
  );
}

export type AuditHistoryScreenProps = {
  sessionId: string;
  onBack?: () => void;
};

export function AuditHistoryScreen({
  sessionId,
  onBack,
}: AuditHistoryScreenProps): React.JSX.Element {
  const auditQuery = useAuditHistory(sessionId);

  return (
    <View style={styles.screenRoot}>
      <View style={styles.headerRow}>
        <MeridianScreenHeader
          title="Note History"
          subtitle="Review the audit trail for this note."
          {...(onBack ? { onBack, backTestID: "audit-back-button" } : {})}
          variant="task"
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {auditQuery.isLoading ? (
          <Text style={styles.emptyText}>Loading history...</Text>
        ) : auditQuery.error ? (
          <Text style={styles.emptyText}>Could not load history.</Text>
        ) : auditQuery.data && auditQuery.data.events.length > 0 ? (
          <View style={styles.eventList}>
            {auditQuery.data.events.map((event) => (
              <EventRow
                key={event.id}
                eventType={event.eventType}
                timestamp={event.timestamp}
                clinicianName={
                  event.user
                    ? `${event.user.firstName} ${event.user.lastName}`
                    : "Unknown clinician"
                }
                metadata={event.metadata}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No history for this note.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: meridian.color.surface,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: meridian.spacing.sm,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.heading,
    flex: 1,
    color: meridian.color.text,
    textAlign: "center",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
    gap: 12,
  },
  eventList: {
    gap: 12,
  },
  eventRow: {
    gap: 6,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  eventType: {
    ...typography.body,
    fontWeight: "600",
    color: meridian.color.text,
    flex: 1,
  },
  timestamp: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontSize: 12,
  },
  clinicianName: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  metadataChip: {
    alignSelf: "flex-start",
    backgroundColor: meridian.color.primarySoft,
    borderRadius: meridian.radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  metadataChipText: {
    ...typography.label,
    color: meridian.color.primary,
    fontSize: 12,
  },
  emptyText: {
    ...typography.body,
    color: meridian.color.textSubtle,
    textAlign: "center",
    marginTop: 40,
  },
});
