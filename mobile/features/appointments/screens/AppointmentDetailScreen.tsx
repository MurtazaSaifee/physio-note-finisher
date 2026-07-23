import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { MeridianButton } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { useAppointmentDetail, useCancelAppointment, useStartSessionFromAppointment } from "../hooks/useAppointments";

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const datePart = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} at ${timePart}`;
}

function formatAppointmentStatus(status: string): string {
  if (status === "upcoming") {
    return "Scheduled";
  }

  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function isMoreThanOneHourAway(scheduledAt: string): boolean {
  const now = Date.now();
  const scheduled = new Date(scheduledAt).getTime();
  return scheduled - now > 60 * 60 * 1000;
}

export type AppointmentDetailScreenProps = {
  appointmentId: string;
  onBack: () => void;
  onStartSession: (patientId: string, sessionId: string) => void;
};

export function AppointmentDetailScreen({
  appointmentId,
  onBack,
  onStartSession,
}: AppointmentDetailScreenProps): React.JSX.Element {
  const detailQuery = useAppointmentDetail(appointmentId);
  const appointment = detailQuery.data;
  const startSessionMutation = useStartSessionFromAppointment();
  const cancelMutation = useCancelAppointment();
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);

  const isUpcoming = appointment?.status === "upcoming";
  const startDisabled = appointment ? isMoreThanOneHourAway(appointment.scheduledAt) : false;
  const startUnavailableReason = startDisabled
    ? "Start Session becomes available one hour before this visit."
    : undefined;

  async function handleStartSession(): Promise<void> {
    if (!appointment || startDisabled) {
      return;
    }

    const result = await startSessionMutation.mutateAsync({
      appointmentId: appointment.id,
      input: { sessionType: appointment.notes ?? "Follow-up" },
    });

    onStartSession(result.patientId, result.sessionId);
  }

  async function handleCancelAppointment(): Promise<void> {
    if (!appointment || cancelMutation.isPending) {
      return;
    }

    await cancelMutation.mutateAsync(appointment.id);
    setIsConfirmingCancel(false);
    await detailQuery.refetch();
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <MeridianScreenHeader
          title="Appointment"
          subtitle="Review this visit before you start the session."
          onBack={onBack}
          backTestID="appointment-detail-back-button"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {appointment ? (
          <View style={styles.detailCard}>
            <Text style={styles.patientName}>{appointment.patientName}</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date and time</Text>
              <Text style={styles.metaValue}>{formatDateTime(appointment.scheduledAt)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Duration</Text>
              <Text style={styles.metaValue}>{`${appointment.durationMinutes} min`}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status</Text>
              <View
                style={[
                  styles.statusPill,
                  styles[`pill_${appointment.status}`],
                ]}
              >
                <Text style={styles.statusPillText}>{formatAppointmentStatus(appointment.status)}</Text>
              </View>
            </View>

          </View>
        ) : (
          <Text style={styles.loadingText}>Loading appointment...</Text>
        )}

        {isUpcoming && (
          <View style={styles.startSessionAction}>
            <MeridianButton
              label="Start Session"
              accessibilityLabel="Start session"
              {...(startUnavailableReason ? { accessibilityHint: startUnavailableReason } : {})}
              disabled={startDisabled}
              onPress={() => void handleStartSession()}
              testID="appointment-detail-start-session-button"
            />
            {startUnavailableReason && (
              <Text style={styles.startSessionUnavailableReason}>
                {startUnavailableReason}
              </Text>
            )}
          </View>
        )}

        {isUpcoming && (
          isConfirmingCancel ? (
            <View style={styles.cancelConfirmation}>
              <Text style={styles.cancelConfirmationText}>
                Cancel this appointment?
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm cancellation"
                testID="appointment-detail-confirm-cancel-button"
                disabled={cancelMutation.isPending}
                onPress={() => void handleCancelAppointment()}
                style={({ pressed }) => [
                  styles.cancelButton,
                  (pressed || cancelMutation.isPending) && styles.pressed,
                ]}
              >
                <Text style={styles.cancelButtonText}>
                  {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel Appointment"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Keep appointment"
                testID="appointment-detail-keep-appointment-button"
                disabled={cancelMutation.isPending}
                onPress={() => setIsConfirmingCancel(false)}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonText}>Keep Appointment</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel appointment"
              testID="appointment-detail-cancel-button"
              disabled={cancelMutation.isPending}
              onPress={() => setIsConfirmingCancel(true)}
              style={({ pressed }) => [
                styles.cancelButton,
                (pressed || cancelMutation.isPending) && styles.pressed,
              ]}
            >
              <Text style={styles.cancelButtonText}>Cancel Appointment</Text>
            </Pressable>
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: meridian.spacing.lg,
    paddingTop: meridian.spacing.lg,
    paddingBottom: meridian.spacing.md,
    backgroundColor: meridian.color.surface,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.heading,
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    padding: meridian.spacing.lg,
    gap: meridian.spacing.md,
    paddingBottom: 120,
  },
  startSessionAction: {
    gap: meridian.spacing.xs,
  },
  startSessionUnavailableReason: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  detailCard: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.lg,
    gap: meridian.spacing.md,
    ...meridian.shadow.card,
  },
  patientName: {
    ...typography.heading,
    fontSize: 20,
    color: meridian.color.text,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  statusPill: {
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
    borderRadius: meridian.radius.chip,
  },
  statusPillText: {
    ...typography.label,
    color: meridian.color.surface,
    fontSize: 11,
    textTransform: "capitalize",
  },
  pill_upcoming: {
    backgroundColor: meridian.color.primary,
  },
  pill_completed: {
    backgroundColor: meridian.color.success,
  },
  pill_cancelled: {
    backgroundColor: meridian.color.textSubtle,
  },
  pill_missed: {
    backgroundColor: meridian.color.textSubtle,
  },
  loadingText: {
    ...typography.body,
    color: meridian.color.textSubtle,
    textAlign: "center",
  },
  cancelConfirmation: {
    gap: meridian.spacing.sm,
    alignItems: "center",
  },
  cancelConfirmationText: {
    ...typography.body,
    color: meridian.color.text,
    textAlign: "center",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: meridian.spacing.md,
  },
  cancelButtonText: {
    ...typography.label,
    color: meridian.color.destructive,
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: meridian.spacing.sm,
  },
  secondaryButtonText: {
    ...typography.label,
    color: meridian.color.primary,
  },
});
