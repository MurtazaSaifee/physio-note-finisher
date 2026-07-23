import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import type { SyncState } from "../../../../shared/contracts/offline";

export type SyncOverlayProps = {
  syncState: SyncState;
};

export function SyncOverlay({ syncState }: SyncOverlayProps): React.JSX.Element | null {
  if (syncState.status === "failed") {
    return (
      <View style={styles.errorBanner} testID="sync-error-state">
        <Text style={styles.errorTitle}>Sync needs attention</Text>
        <Text style={styles.errorText}>
          We couldn't sync these changes. They are still saved on this device.
        </Text>
      </View>
    );
  }

  if (syncState.status !== "syncing") {
    return null;
  }

  const current = syncState.currentItem ?? 0;
  const total = syncState.totalItems ?? 0;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.container}>
        <ActivityIndicator size="large" color={meridian.color.primary} />
        <Text style={styles.text}>
          Syncing {current} of {total} changes...
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  container: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.lg,
    gap: meridian.spacing.md,
    alignItems: "center",
    minWidth: 200,
  },
  text: {
    ...typography.body,
    color: meridian.color.text,
    textAlign: "center",
  },
  errorBanner: {
    position: "absolute",
    left: meridian.spacing.lg,
    right: meridian.spacing.lg,
    bottom: meridian.spacing.lg,
    backgroundColor: meridian.color.warningSoft,
    borderColor: meridian.color.warning,
    borderWidth: 1,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    gap: meridian.spacing.xs,
    zIndex: 999,
  },
  errorTitle: {
    ...typography.label,
    color: meridian.color.warning,
  },
  errorText: {
    ...typography.body,
    color: meridian.color.text,
  },
});
