import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ChevronRight,
  Search,
  UserPlus,
} from "lucide-react-native";

import type { CreatePatientRequest, PatientListItem } from "../../../../shared/contracts/patients";
import { useCreatePatient, usePatientList } from "../../patients/hooks/usePatients";
import { MeridianChip, MeridianInput } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../ui/userFacingErrors";

type SelectPatientScreenProps = {
  onBack: () => void;
  onPatientSelected: (patientId: string) => void;
  initialQuery?: string;
};

const alphaLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function toRecentPatients(items: PatientListItem[]): PatientListItem[] {
  return items
    .filter((item) => !item.archivedAt && Boolean(item.lastVisitDate))
    .sort((a, b) => {
      const aTime = new Date(a.lastVisitDate ?? "").getTime();
      const bTime = new Date(b.lastVisitDate ?? "").getTime();
      return bTime - aTime;
    })
    .slice(0, 3);
}

function parseConditionTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function formatLastVisit(lastVisitDate?: string | null): string {
  if (!lastVisitDate) {
    return "No recent visit";
  }

  return `Last visit: ${new Date(lastVisitDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0] ?? "";
  const second = parts[1] ?? "";

  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }

  return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
}

function PatientCard({
  patient,
  pressAccessibilityLabel,
  onPress,
  testID,
}: {
  patient: PatientListItem;
  pressAccessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pressAccessibilityLabel}
      testID={testID}
      onPress={onPress}
      data-patient-id={patient.id}
      data-patient-name={patient.fullName}
      style={({ pressed }) => [styles.patientCardPressable, pressed && styles.pressed]}
    >
      <View style={styles.patientCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(patient.fullName)}</Text>
        </View>
        <View style={styles.patientCopy}>
          <Text style={styles.patientName}>{patient.fullName}</Text>
          <Text style={styles.patientMeta}>{formatLastVisit(patient.lastVisitDate)}</Text>
        </View>
        <ChevronRight color={meridian.color.textSubtle} size={24} />
      </View>
    </Pressable>
  );
}

export function SelectPatientScreen({
  onBack,
  onPatientSelected,
  initialQuery = "",
}: SelectPatientScreenProps): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const [alpha, setAlpha] = useState<string>("All");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [conditionTags, setConditionTags] = useState("");
  const [showCreatePatientForm, setShowCreatePatientForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const listQuery = usePatientList({ query });
  const createPatient = useCreatePatient();

  const items = listQuery.data?.items ?? [];

  const recentPatients = toRecentPatients(items);
  const alphaPatients = (() => {
    const active = items.filter((item) => !item.archivedAt);
    if (alpha === "All") {
      return active;
    }

    return active.filter((item) =>
      item.fullName.toUpperCase().startsWith(alpha),
    );
  })();

  async function handleCreatePatient(): Promise<void> {
    const trimmedName = fullName.trim();
    if (trimmedName.length === 0) {
      setCreateError("Name is required");
      return;
    }

    setCreateError(null);

    const input: CreatePatientRequest = {
      fullName: trimmedName,
    };
    const trimmedPhone = phone.trim();
    const parsedConditionTags = parseConditionTags(conditionTags);
    if (trimmedPhone.length > 0) {
      input.phone = trimmedPhone;
    }
    if (parsedConditionTags.length > 0) {
      input.conditionTags = parsedConditionTags;
    }

    try {
      const created = await createPatient.mutateAsync(input);
      setShowCreatePatientForm(false);
      setFullName("");
      setPhone("");
      setConditionTags("");
      setCreateError(null);
      onPatientSelected(created.id);
    } catch (err) {
      setCreateError(getUserSafeErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardRoot}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <MeridianScreenHeader
          title="Select Patient"
          subtitle="Choose an existing patient or add a new one if needed."
          onBack={onBack}
          backTestID="select-patient-back-button"
          variant="task"
        />

        <View style={styles.searchShell}>
          <Search color={meridian.color.primary} size={22} />
          <MeridianInput
            placeholder="Search by name or contact"
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            testID="select-patient-search-input"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add New Patient"
          testID="select-patient-add-new-patient-button"
          onPress={() => {
            if (showCreatePatientForm) {
              void handleCreatePatient();
              return;
            }

            setShowCreatePatientForm(true);
          }}
          disabled={createPatient.isPending}
          style={({ pressed }) => [
            styles.primaryAction,
            createPatient.isPending && styles.actionDisabled,
            pressed && !createPatient.isPending && styles.pressed,
          ]}
        >
          <View style={styles.primaryActionIcon}>
            <UserPlus color={meridian.color.primary} size={18} />
          </View>
          <Text style={styles.primaryActionText}>
            {createPatient.isPending ? "Creating patient..." : "Add patient"}
          </Text>
        </Pressable>

        {showCreatePatientForm ? (
          <View style={styles.createForm}>
            <MeridianInput
              placeholder="Full name"
              value={fullName}
              onChangeText={setFullName}
              testID="select-patient-fullname-input"
            />
            <MeridianInput
              placeholder="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              testID="select-patient-phone-input"
            />
            <MeridianInput
              placeholder="Condition tags"
              value={conditionTags}
              onChangeText={setConditionTags}
              testID="select-patient-condition-tags-input"
            />
            {createError ? (
              <Text style={styles.errorText}>{createError}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Patients</Text>
          {recentPatients.length ? (
            <View style={styles.patientList}>
              {recentPatients.map((patient, index) => (
                <PatientCard
                  key={`recent-${patient.id}`}
                  patient={patient}
                  pressAccessibilityLabel="Open recent patient"
                  onPress={() => onPatientSelected(patient.id)}
                  testID={`select-patient-recent-patient-${index}-card`}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No recent patients</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>A-Z</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.alphaRow}>
              <MeridianChip
                label="All"
                selected={alpha === "All"}
                onPress={() => setAlpha("All")}
                testID="select-patient-alpha-all-chip"
              />
              {alphaLetters.map((letter) => (
                <MeridianChip
                  key={letter}
                  label={letter}
                  selected={alpha === letter}
                  onPress={() => setAlpha(letter)}
                  testID={`select-patient-alpha-${letter.toLowerCase()}-chip`}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.patientList}>
            {alphaPatients.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 ? <View style={styles.listDivider} /> : null}
                <PatientCard
                  patient={item}
                  pressAccessibilityLabel="Open patient"
                  onPress={() => onPatientSelected(item.id)}
                  testID={`select-patient-patient-${index}-card`}
                />
              </React.Fragment>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  screen: {
    paddingHorizontal: meridian.spacing.lg,
    paddingTop: meridian.spacing.lg,
    paddingBottom: meridian.spacing.xl,
    gap: 16,
    backgroundColor: meridian.color.background,
  },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: meridian.color.surface,
    borderRadius: 18,
    paddingHorizontal: meridian.spacing.md,
    minHeight: 54,
    borderWidth: 1,
    borderColor: meridian.color.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingVertical: 0,
    minHeight: 0,
  },
  primaryAction: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: meridian.color.surface,
    borderWidth: 1,
    borderColor: meridian.color.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: meridian.spacing.sm,
    paddingHorizontal: meridian.spacing.lg,
  },
  primaryActionIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    ...typography.label,
    color: meridian.color.text,
    fontSize: 15,
  },
  createForm: {
    gap: meridian.spacing.sm,
  },
  actionDisabled: {
    opacity: 0.65,
  },
  section: {
    gap: meridian.spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: meridian.color.text,
    fontSize: 18,
  },
  alphaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
  },
  patientList: {
    gap: 0,
  },
  listDivider: {
    height: meridian.spacing.sm,
  },
  patientCardPressable: {
    borderRadius: meridian.radius.card,
  },
  patientCard: {
    minHeight: 82,
    borderRadius: meridian.radius.card,
    backgroundColor: meridian.color.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: meridian.spacing.md,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: meridian.color.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.label,
    color: meridian.color.text,
  },
  patientCopy: {
    flex: 1,
    gap: 2,
  },
  patientName: {
    ...typography.body,
    color: meridian.color.text,
    fontFamily: "PublicSans_400Regular",
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 19,
  },
  patientMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontSize: 13,
  },
  emptyText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  errorText: {
    ...typography.body,
    color: meridian.color.destructive,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
});
