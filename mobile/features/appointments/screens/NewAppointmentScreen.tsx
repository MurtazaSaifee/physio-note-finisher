import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Calendar, Clock } from "lucide-react-native";

import {
  MeridianButton,
  MeridianEmptyState,
  MeridianInput,
} from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { usePatientList } from "../../patients/hooks/usePatients";
import { useCreateAppointment } from "../hooks/useAppointments";

function formatDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split("T")[0] ?? "";
}

function formatTimeInputValue(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function parseLocalDateValue(value: string): Date | null {
  const values = value.split("-").map(Number);
  const yearValue = values[0];
  const monthValue = values[1];
  const dayValue = values[2];
  if (
    values.length !== 3 ||
    yearValue === undefined ||
    monthValue === undefined ||
    dayValue === undefined ||
    !Number.isInteger(yearValue) ||
    !Number.isInteger(monthValue) ||
    !Number.isInteger(dayValue)
  ) {
    return null;
  }

  const date = new Date(yearValue, monthValue - 1, dayValue);
  return date.getFullYear() === yearValue &&
      date.getMonth() === monthValue - 1 &&
      date.getDate() === dayValue
    ? date
    : null;
}

function formatDateDisplayValue(dateValue: string): string {
  if (!dateValue) {
    return "Select date";
  }

  const date = parseLocalDateValue(dateValue);
  if (!date) {
    return "Select date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getTimezoneOffsetString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const sign = offset <= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offset);
  const hours = Math.floor(absoluteOffset / 60).toString().padStart(2, "0");
  const minutes = (absoluteOffset % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function formatScheduledAtValue(dateValue: string, timeValue: string): string | null {
  const date = parseLocalDateValue(dateValue);
  const timeValues = timeValue.split(":").map(Number);
  const hours = timeValues[0];
  const minutes = timeValues[1];
  if (
    !date ||
    timeValues.length !== 2 ||
    hours === undefined ||
    minutes === undefined ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const localDateTime = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
  );
  if (
    localDateTime.getFullYear() !== date.getFullYear() ||
    localDateTime.getMonth() !== date.getMonth() ||
    localDateTime.getDate() !== date.getDate() ||
    localDateTime.getHours() !== hours ||
    localDateTime.getMinutes() !== minutes
  ) {
    return null;
  }

  return `${dateValue}T${timeValue}:00${getTimezoneOffsetString(localDateTime)}`;
}

export type NewAppointmentScreenProps = {
  onBack: () => void;
  onCreated: (appointmentId: string) => void;
  prefillPatientId?: string | undefined;
  prefillPatientName?: string;
  prefillScheduledAt?: string;
};

export function NewAppointmentScreen({
  onBack,
  onCreated,
  prefillPatientId,
  prefillPatientName,
  prefillScheduledAt,
}: NewAppointmentScreenProps): React.JSX.Element {
  const hasPrefillPatient = Boolean(prefillPatientId);
  const [patientSearch, setPatientSearch] = useState("");
  const patientListQuery = usePatientList(
    hasPrefillPatient ? {} : { query: patientSearch },
  );
  const createMutation = useCreateAppointment();
  const initialDateRef = useRef<Date | null>(null);
  if (initialDateRef.current === null) {
    initialDateRef.current = prefillScheduledAt ? new Date(prefillScheduledAt) : new Date();
  }
  const datePickerFallbackRef = useRef<Date | null>(null);
  if (datePickerFallbackRef.current === null) {
    datePickerFallbackRef.current = new Date();
  }
  const timePickerFallbackRef = useRef<Date | null>(null);
  if (timePickerFallbackRef.current === null) {
    timePickerFallbackRef.current = new Date(2000, 0, 1, 9, 0, 0, 0);
  }

  const [selectedPatientId, setSelectedPatientId] = useState<string>(prefillPatientId ?? "");
  const [selectedPatientName, setSelectedPatientName] = useState(prefillPatientName ?? "");
  const [dateValue, setDateValue] = useState<string>(() =>
    formatDateInputValue(initialDateRef.current ?? new Date()),
  );
  const [timeValue, setTimeValue] = useState<string>(() =>
    formatTimeInputValue(initialDateRef.current ?? new Date()),
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [notes, setNotes] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const patients = patientListQuery.data?.items ?? [];
  const datePickerValue = dateValue
    ? (parseLocalDateValue(dateValue) ?? datePickerFallbackRef.current ?? new Date())
    : (datePickerFallbackRef.current ?? new Date());
  const timePickerValue = timeValue
    ? new Date(`2000-01-01T${timeValue}`)
    : (timePickerFallbackRef.current ?? new Date(2000, 0, 1, 9, 0, 0, 0));
  const selectedPatient = useMemo(
    () =>
      selectedPatientId
        ? patients.find((patient) => patient.id === selectedPatientId) ?? null
        : null,
    [patients, selectedPatientId],
  );
  const selectedPatientDisplayName =
    selectedPatientName || selectedPatient?.fullName || prefillPatientName || "";
  const matchingPatients =
    selectedPatientId || patientSearch.trim().length === 0 ? [] : patients.slice(0, 5);
  const missingAppointmentRequirements = [
    !selectedPatientId ? "select a patient" : null,
    !dateValue ? "choose a date" : null,
    !timeValue ? "choose a time" : null,
  ].filter((requirement): requirement is string => Boolean(requirement));
  const appointmentRequirementSummary = missingAppointmentRequirements.join(" and ");
  const createAppointmentGuidance = appointmentRequirementSummary
    ? `${appointmentRequirementSummary.charAt(0).toUpperCase()}${appointmentRequirementSummary.slice(1)} to create an appointment.`
    : null;

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (event.type !== "set" || !selectedDate) {
      return;
    }

    setDateValue(formatDateInputValue(selectedDate));
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowTimePicker(false);
    if (event.type !== "set" || !selectedDate) {
      return;
    }

    setTimeValue(formatTimeInputValue(selectedDate));
  };

  const handlePatientSelect = (patient: { id: string; fullName: string }) => {
    setSelectedPatientId(patient.id);
    setSelectedPatientName(patient.fullName);
    setPatientSearch("");
  };

  const handlePatientChange = () => {
    setSelectedPatientId("");
    setSelectedPatientName("");
  };

  const handleCreate = async () => {
    if (!selectedPatientId) return;

    const scheduledAt = formatScheduledAtValue(dateValue, timeValue);
    if (!scheduledAt) return;

    const appointment = await createMutation.mutateAsync({
      patientId: selectedPatientId,
      patientNameSnapshot: selectedPatientDisplayName || undefined,
      scheduledAt,
      durationMinutes,
      notes: notes || null,
    });

    onCreated(appointment.id);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <MeridianScreenHeader
          title="New Appointment"
          subtitle="Schedule the visit and link it to the right patient."
          onBack={onBack}
          backTestID="new-appointment-back-button"
          variant="task"
        />
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Patient</Text>

          {!hasPrefillPatient && !selectedPatientId ? (
            <View style={styles.patientSearchBlock}>
              <MeridianInput
                value={patientSearch}
                onChangeText={setPatientSearch}
                placeholder="Search patient by name"
                testID="new-appointment-patient-search-input"
              />

              {patientSearch.trim().length > 0 ? (
                <View style={styles.patientResults}>
                  {patientListQuery.isLoading ? (
                    <View
                      style={styles.patientEmptyState}
                      testID="new-appointment-patient-loading-state"
                    >
                      <Text style={styles.patientEmptyText}>Searching patients...</Text>
                    </View>
                  ) : patientListQuery.isError ? (
                    <MeridianEmptyState
                      title="We couldn't search patients."
                      message="Check your connection and try again."
                      testID="new-appointment-patient-error-state"
                      action={(
                        <MeridianButton
                          label="Try again"
                          variant="secondary"
                          onPress={() => {
                            void patientListQuery.refetch();
                          }}
                          testID="new-appointment-patient-retry-button"
                        />
                      )}
                    />
                  ) : matchingPatients.length > 0 ? (
                    matchingPatients.map((patient, index) => (
                      <Pressable
                        key={patient.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${patient.fullName}`}
                        testID={`new-appointment-patient-${index}-card`}
                        onPress={() => handlePatientSelect(patient)}
                        style={({ pressed }) => [styles.patientRow, pressed && styles.pressed]}
                      >
                        <Text style={styles.patientRowText}>{patient.fullName}</Text>
                      </Pressable>
                    ))
                  ) : (
                    <View
                      style={styles.patientEmptyState}
                      testID="new-appointment-patient-empty-state"
                    >
                      <Text style={styles.patientEmptyText}>No matching patients</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {selectedPatientId ? (
            <View
              style={styles.selectedPatientCard}
              testID="new-appointment-selected-patient-card"
            >
              <View style={styles.selectedPatientCopy}>
                <Text style={styles.selectedPatientLabel}>Selected patient</Text>
                <Text style={styles.selectedPatientName}>
                  {selectedPatientDisplayName || "Patient selected"}
                </Text>
              </View>
              {!hasPrefillPatient ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change patient"
                  testID="new-appointment-change-patient-button"
                  onPress={handlePatientChange}
                  style={({ pressed }) => [styles.changePatientButton, pressed && styles.pressed]}
                >
                  <Text style={styles.changePatientText}>Change</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Date</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select date"
            testID="new-appointment-date-picker"
            onPress={() => setShowDatePicker(true)}
            style={({ pressed }) => [styles.dateTimeButton, pressed && styles.pressed]}
          >
            <Calendar color={meridian.color.textSubtle} size={18} />
            <Text style={styles.dateTimeButtonText}>{formatDateDisplayValue(dateValue)}</Text>
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={datePickerValue}
              mode="date"
              display="default"
              onChange={handleDateChange}
              testID="new-appointment-date-datetimepicker"
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Time</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select time"
            testID="new-appointment-time-picker"
            onPress={() => setShowTimePicker(true)}
            style={({ pressed }) => [styles.dateTimeButton, pressed && styles.pressed]}
          >
            <Clock color={meridian.color.textSubtle} size={18} />
            <Text style={styles.dateTimeButtonText}>{timeValue || "Select time"}</Text>
          </Pressable>
          {showTimePicker && (
            <DateTimePicker
              value={timePickerValue}
              mode="time"
              display="default"
              onChange={handleTimeChange}
              testID="new-appointment-time-datetimepicker"
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Duration</Text>
          <View style={styles.durationRow}>
            {[15, 30, 45, 60].map((min) => (
              <Pressable
                key={min}
                accessibilityRole="button"
                accessibilityLabel={`${min} minutes`}
                accessibilityState={{ selected: durationMinutes === min }}
                testID={`new-appointment-duration-${min}-chip`}
                onPress={() => setDurationMinutes(min)}
                style={[
                  styles.durationChip,
                  durationMinutes === min && styles.durationChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.durationChipText,
                    durationMinutes === min && styles.durationChipTextSelected,
                  ]}
                >
                  {min} min
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <MeridianInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes"
            multiline
            numberOfLines={3}
            style={styles.notesInput}
            testID="new-appointment-notes-input"
          />
        </View>

        {createAppointmentGuidance ? (
          <Text testID="new-appointment-create-guidance" style={styles.actionGuidance}>
            {createAppointmentGuidance}
          </Text>
        ) : null}
        {createMutation.isError ? (
          <Text testID="new-appointment-create-error" style={styles.actionError}>
            We couldn't create the appointment. Check your connection and try again.
          </Text>
        ) : null}
        <MeridianButton
          label="Create Appointment"
          disabled={!selectedPatientId || createMutation.isPending}
          onPress={handleCreate}
          testID="new-appointment-create-button"
        />
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
  title: {
    ...typography.heading,
  },
  pressed: {
    opacity: 0.8,
  },
  form: {
    padding: meridian.spacing.lg,
    gap: meridian.spacing.md,
    paddingBottom: 120,
  },
  section: {
    gap: meridian.spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: meridian.color.text,
  },
  patientSearchBlock: {
    gap: meridian.spacing.xs,
  },
  patientResults: {
    gap: meridian.spacing.xs,
  },
  patientRow: {
    padding: meridian.spacing.md,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.surface,
    borderWidth: 1,
    borderColor: meridian.color.border,
  },
  patientRowText: {
    ...typography.body,
    color: meridian.color.text,
  },
  patientEmptyState: {
    padding: meridian.spacing.md,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.surface,
    borderWidth: 1,
    borderColor: meridian.color.border,
  },
  patientEmptyText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  selectedPatientCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
    padding: meridian.spacing.md,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.primarySoft,
    borderWidth: 1,
    borderColor: meridian.color.primary,
  },
  selectedPatientCopy: {
    flex: 1,
    gap: 4,
  },
  selectedPatientLabel: {
    ...typography.label,
    color: meridian.color.primary,
    letterSpacing: 0.6,
  },
  selectedPatientName: {
    ...typography.body,
    color: meridian.color.text,
    fontWeight: "600",
  },
  changePatientButton: {
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: 6,
    borderRadius: meridian.radius.chip,
    backgroundColor: meridian.color.surface,
  },
  changePatientText: {
    ...typography.label,
    color: meridian.color.primary,
  },
  durationRow: {
    flexDirection: "row",
    gap: meridian.spacing.sm,
  },
  durationChip: {
    flex: 1,
    paddingVertical: meridian.spacing.sm,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.surface,
    borderWidth: 1,
    borderColor: meridian.color.border,
    alignItems: "center",
  },
  durationChipSelected: {
    borderColor: meridian.color.primary,
    backgroundColor: meridian.color.primarySoft,
  },
  durationChipText: {
    ...typography.label,
    color: meridian.color.text,
  },
  durationChipTextSelected: {
    color: meridian.color.primary,
    fontWeight: "600",
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  actionGuidance: {
    ...typography.label,
    color: meridian.color.textSubtle,
    marginBottom: meridian.spacing.md,
  },
  actionError: {
    ...typography.label,
    color: meridian.color.destructive,
    marginBottom: meridian.spacing.md,
  },
  dateTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.control,
    borderWidth: 1,
    borderColor: meridian.color.border,
    paddingHorizontal: meridian.spacing.md,
    paddingVertical: meridian.spacing.md,
  },
  dateTimeButtonText: {
    ...typography.body,
    color: meridian.color.text,
  },
});
