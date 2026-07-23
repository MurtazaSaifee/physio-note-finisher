import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SessionTimelineItem } from "../../../../shared/contracts/sessions";

type TimelineCardProps = {
  item: SessionTimelineItem;
  onOpenSession: (patientId: string, sessionId: string) => void;
  testID?: string;
  statusTestID?: string;
};

import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { MeridianCard, MeridianStatusPill, StatusPillType } from "../../ui/meridian/primitives";


function formatLabel(value: string | null): string {
  return value && value.trim().length > 0 ? value : "Not available";
}

function formatDisplayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TimelineCard({
  item,
  onOpenSession,
  testID,
  statusTestID,
}: TimelineCardProps): React.JSX.Element {
  const isEditable = item.noteStatus === "draft" || item.noteStatus === "reopened";
  const actionLabel = isEditable ? "Resume draft" : "View finalized note";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel}: ${item.visitType}`}
      accessibilityHint={isEditable ? "Opens this editable SOAP draft." : "Opens this finalized note in read-only preview."}
      testID={testID}
      onPress={() => onOpenSession(item.patientId, item.id)}
      style={({ pressed }) => [
        pressed ? styles.cardPressed : null,
      ]}
    >
      <MeridianCard>
        <View style={styles.headerRow}>
          <View style={styles.datePill}>
            <Text style={styles.dateText}>{formatDisplayDate(item.sessionDate)}</Text>
          </View>
          <View style={styles.cardActions}>
            <MeridianStatusPill
              status={item.noteStatus as StatusPillType}
              label={item.noteStatus}
              {...(statusTestID ? { testID: statusTestID } : {})}
            />
            <Text
              style={styles.openCue}
              {...(testID ? { testID: `${testID}-open-cue` } : {})}
            >
              {actionLabel}
            </Text>
          </View>
        </View>

      <Text style={styles.visitType}>{item.visitType}</Text>

      <View style={styles.previewBlock}>
        <Text style={styles.previewLabel}>Final note</Text>
        <Text style={styles.previewValue}>{formatLabel(item.finalNotePreview)}</Text>
      </View>

      <View style={styles.previewBlock}>
        <Text style={styles.previewLabel}>Patient summary</Text>
        <Text style={styles.previewValue}>
          {formatLabel(item.patientSummaryPreview)}
        </Text>
      </View>
      </MeridianCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardPressed: {
    opacity: 0.8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  datePill: {
    backgroundColor: meridian.color.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateText: {
    ...typography.label,
    color: meridian.color.text,
  },
  visitType: {
    ...typography.heading,
    color: meridian.color.text,
  },
  previewBlock: {
    gap: 4,
  },
  previewLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
    textTransform: "uppercase",
  },
  previewValue: {
    ...typography.body,
    color: meridian.color.text,
  },
  openCue: {
    ...typography.label,
    color: meridian.color.primary,
    fontWeight: "600",
  },
});
