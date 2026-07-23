import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react-native";

import { MeridianButton, MeridianEmptyState } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { useAppointmentDay } from "../hooks/useAppointments";

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return (dateString.split("T")[1] ?? "00:00").slice(0, 5);
  }

  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function formatAppointmentStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function formatAgendaDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getLocalDateString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split("T")[0] ?? "";
}

function getTimezoneOffsetString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const sign = offset <= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offset);
  const hours = Math.floor(absoluteOffset / 60).toString().padStart(2, "0");
  const minutes = (absoluteOffset % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function isSameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function shiftDay(date: Date, amount: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "upcoming":
      return meridian.color.primary;
    case "completed":
      return meridian.color.success;
    case "missed":
      return meridian.color.warning;
    default:
      return meridian.color.textSubtle;
  }
}

export type CalendarScreenProps = {
  onOpenAppointment: (appointmentId: string) => void;
  onNewAppointment: () => void;
  isActive?: boolean;
};

export function CalendarScreen({
  onOpenAppointment,
  onNewAppointment,
  isActive = true,
}: CalendarScreenProps): React.JSX.Element {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const dateString = getLocalDateString(currentDate);
  const timezoneOffset = getTimezoneOffsetString(currentDate);
  const dayQuery = useAppointmentDay(dateString, timezoneOffset, { enabled: isActive });
  const today = new Date();
  const isViewingToday = isSameDay(currentDate, today);
  const appointments = dayQuery.data?.items ?? [];
  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort(
        (first, second) =>
          new Date(first.scheduledAt).getTime() - new Date(second.scheduledAt).getTime(),
      ),
    [appointments],
  );
  const nextUpcoming = isViewingToday
    ? sortedAppointments.find(
        (appointment) =>
          appointment.status === "upcoming" && new Date(appointment.scheduledAt).getTime() > today.getTime(),
      )
    : undefined;
  const agendaAppointments = nextUpcoming
    ? sortedAppointments.filter((appointment) => appointment.id !== nextUpcoming.id)
    : sortedAppointments;

  const handleRefresh = useCallback(() => {
    void dayQuery.refetch();
  }, [dayQuery]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setIsDatePickerVisible(false);
    if (event.type !== "set" || !selectedDate) return;

    setCurrentDate((previousDate) =>
      new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        previousDate.getHours(),
        previousDate.getMinutes(),
        previousDate.getSeconds(),
        previousDate.getMilliseconds(),
      ),
    );
  };

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={dayQuery.isRefetching}
        onRefresh={handleRefresh}
        testID="calendar-refresh-control"
        tintColor={meridian.color.primary}
      />
    ),
    [dayQuery.isRefetching, handleRefresh],
  );
  const showAgendaCount = !dayQuery.isLoading && !dayQuery.isError;
  const visitCountLabel = `${sortedAppointments.length} ${
    sortedAppointments.length === 1 ? "visit" : "visits"
  }`;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.screen} refreshControl={refreshControl}>
        <MeridianScreenHeader
          title="Calendar"
          variant="root"
          action={
            !isViewingToday ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Return to today"
                onPress={() => setCurrentDate(new Date())}
                testID="calendar-today-button"
                style={({ pressed }) => [styles.todayAction, pressed && styles.pressed]}
              >
                <Text style={styles.todayActionText}>Go to today</Text>
              </Pressable>
            ) : undefined
          }
        />

        <View style={styles.dateControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => setCurrentDate((date) => shiftDay(date, -1))}
            testID="calendar-previous-day-button"
            style={({ pressed }) => [styles.dateNavigationButton, pressed && styles.pressed]}
          >
            <ChevronLeft color={meridian.color.primary} size={20} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Selected date ${formatAgendaDate(currentDate)}`}
            accessibilityState={{ selected: true }}
            onPress={() => setIsDatePickerVisible(true)}
            testID="calendar-selected-date-button"
            style={({ pressed }) => [styles.selectedDateButton, pressed && styles.pressed]}
          >
            <Text style={styles.selectedDateText}>{formatAgendaDate(currentDate)}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            onPress={() => setCurrentDate((date) => shiftDay(date, 1))}
            testID="calendar-next-day-button"
            style={({ pressed }) => [styles.dateNavigationButton, pressed && styles.pressed]}
          >
            <ChevronRight color={meridian.color.primary} size={20} />
          </Pressable>
        </View>

        {isDatePickerVisible ? (
          <DateTimePicker
            value={currentDate}
            mode="date"
            display="default"
            onChange={handleDateChange}
            testID="calendar-date-picker"
          />
        ) : null}

        {nextUpcoming ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open next visit for ${nextUpcoming.patientName}`}
            onPress={() => onOpenAppointment(nextUpcoming.id)}
            testID="calendar-next-visit-button"
            style={({ pressed }) => [styles.nextVisitRow, pressed && styles.pressed]}
          >
            <View style={styles.nextVisitCopy}>
              <Text style={styles.nextVisitLabel}>Next visit</Text>
              <Text style={styles.nextVisitPatient}>{nextUpcoming.patientName}</Text>
            </View>
            <View style={styles.nextVisitMeta}>
              <Text style={styles.nextVisitTime}>{formatTime(nextUpcoming.scheduledAt)}</Text>
              <ChevronRight color={meridian.color.textSubtle} size={18} />
            </View>
          </Pressable>
        ) : null}

        <View style={styles.agendaHeader}>
          <Text accessibilityRole="header" style={styles.agendaTitle}>
            {formatAgendaDate(currentDate)}
          </Text>
          {showAgendaCount ? <Text style={styles.agendaCount}>{visitCountLabel}</Text> : null}
        </View>

        {dayQuery.isLoading ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Loading calendar"
            testID="calendar-loading-state"
            style={styles.loadingState}
          >
            <Text style={styles.loadingText}>Loading visits</Text>
          </View>
        ) : dayQuery.isError ? (
          <MeridianEmptyState
            title="Calendar unavailable"
            message="Check the connection and try again."
            action={(
              <MeridianButton
                label="Try again"
                variant="secondary"
                onPress={handleRefresh}
                testID="calendar-retry-button"
              />
            )}
            testID="calendar-error-state"
          />
        ) : agendaAppointments.length === 0 && !nextUpcoming ? (
          <MeridianEmptyState
            title="No visits scheduled"
            message="Use + Add to schedule a visit for this day."
            testID="calendar-empty-state"
          />
        ) : (
          <View style={styles.appointmentList}>
            {agendaAppointments.map((appointment, index) => (
              <Pressable
                key={appointment.id}
                accessibilityRole="button"
                accessibilityLabel={`Open appointment for ${appointment.patientName} at ${formatTime(appointment.scheduledAt)}`}
                onPress={() => onOpenAppointment(appointment.id)}
                testID={`calendar-appointment-${index}-button`}
                style={({ pressed }) => [styles.appointmentRow, pressed && styles.pressed]}
              >
                <Text style={styles.timeLabel}>{formatTime(appointment.scheduledAt)}</Text>
                <View style={styles.appointmentCopy}>
                  <Text style={styles.patientName}>{appointment.patientName}</Text>
                  <Text style={styles.visitDuration}>{appointment.durationMinutes} min</Text>
                </View>
                <Text
                  testID={`calendar-appointment-${index}-status`}
                  style={[styles.statusText, { color: getStatusColor(appointment.status) }]}
                >
                  {formatAppointmentStatus(appointment.status)}
                </Text>
                <ChevronRight color={meridian.color.textSubtle} size={18} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add appointment"
        onPress={onNewAppointment}
        testID="calendar-add-appointment-button"
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      >
        <Plus color={meridian.color.surface} size={20} />
        <Text style={styles.addButtonText}>Add</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  screen: {
    padding: meridian.spacing.lg,
    paddingBottom: 112,
    gap: meridian.spacing.lg,
  },
  dateControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.sm,
  },
  dateNavigationButton: {
    width: meridian.touchTarget.visible,
    height: meridian.touchTarget.visible,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.primarySoft,
  },
  selectedDateButton: {
    flex: 1,
    minHeight: meridian.touchTarget.visible,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.surface,
    borderColor: meridian.color.border,
    borderWidth: 1,
  },
  selectedDateText: {
    ...typography.label,
    color: meridian.color.text,
  },
  todayAction: {
    minHeight: meridian.touchTarget.hit,
    minWidth: meridian.touchTarget.hit,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: meridian.spacing.sm,
    backgroundColor: "transparent",
  },
  todayActionText: {
    ...typography.label,
    color: meridian.color.primary,
  },
  nextVisitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
    paddingVertical: meridian.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: meridian.color.border,
  },
  nextVisitCopy: {
    flex: 1,
    gap: 2,
  },
  nextVisitLabel: {
    ...typography.label,
    color: meridian.color.primary,
  },
  nextVisitPatient: {
    ...typography.body,
    color: meridian.color.text,
  },
  nextVisitMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.xs,
  },
  nextVisitTime: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  agendaHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
  },
  agendaTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  agendaCount: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  loadingText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  appointmentList: {
    borderTopWidth: 1,
    borderTopColor: meridian.color.border,
  },
  appointmentRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
    paddingVertical: meridian.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: meridian.color.border,
  },
  timeLabel: {
    ...typography.label,
    minWidth: 48,
    color: meridian.color.primary,
  },
  appointmentCopy: {
    flex: 1,
    gap: 2,
  },
  patientName: {
    ...typography.body,
    color: meridian.color.text,
  },
  visitDuration: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  statusText: {
    ...typography.label,
    textTransform: "capitalize",
  },
  addButton: {
    position: "absolute",
    right: meridian.spacing.lg,
    bottom: meridian.spacing.lg,
    minHeight: meridian.touchTarget.visible,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: meridian.spacing.xs,
    paddingHorizontal: meridian.spacing.md,
    borderRadius: meridian.radius.chip,
    backgroundColor: meridian.color.primary,
  },
  addButtonText: {
    ...typography.label,
    color: meridian.color.surface,
  },
  pressed: {
    opacity: 0.8,
  },
});
