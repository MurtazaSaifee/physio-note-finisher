import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import type { SyncStatus } from "../../../../shared/contracts/offline";

export type PendingSyncPillProps = {
  syncStatus: SyncStatus;
};

export function PendingSyncPill({ syncStatus }: PendingSyncPillProps): React.JSX.Element | null {
  if (syncStatus !== "pending" && syncStatus !== "failed") {
    return null;
  }

  const isFailed = syncStatus === "failed";

  return (
    <View
      style={[styles.pill, isFailed && styles.failedPill]}
      testID={isFailed ? "sync-needs-attention-pill" : "pending-sync-pill"}
    >
      <Text style={[styles.text, isFailed && styles.failedText]}>
        {isFailed ? "Sync needs attention" : "Pending sync"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
    borderRadius: meridian.radius.chip,
    backgroundColor: meridian.color.warning,
    alignSelf: "flex-start",
  },
  text: {
    ...typography.label,
    color: meridian.color.surface,
    fontSize: 12,
  },
  failedPill: {
    backgroundColor: meridian.color.warningSoft,
    borderWidth: 1,
    borderColor: meridian.color.warning,
  },
  failedText: {
    color: meridian.color.warning,
  },
});
