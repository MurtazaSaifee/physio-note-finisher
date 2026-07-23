import React, { useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { CreatePatientRequest } from "../../../../shared/contracts/patients";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { MeridianButton, MeridianInput } from "../../ui/meridian/primitives";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../ui/userFacingErrors";
import { useCreatePatient } from "../hooks/usePatients";

type CreatePatientScreenProps = {
  onBack: () => void;
  onCreated: (patientId: string) => void;
};

function buildCreatePatientInput(fullName: string, phone: string): CreatePatientRequest {
  const input: CreatePatientRequest = { fullName: fullName.trim() };
  const trimmedPhone = phone.trim();

  if (trimmedPhone) {
    input.phone = trimmedPhone;
  }

  return input;
}

export function CreatePatientScreen({
  onBack,
  onCreated,
}: CreatePatientScreenProps): React.JSX.Element {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const createPatient = useCreatePatient();
  const canSave = fullName.trim().length > 0 && !createPatient.isPending;

  async function handleSave(): Promise<void> {
    if (!canSave) return;

    setSubmissionError("");

    try {
      const createdPatient = await createPatient.mutateAsync(
        buildCreatePatientInput(fullName, phone),
      );
      AccessibilityInfo.announceForAccessibility("Patient added");
      onCreated(createdPatient.id);
    } catch (error) {
      setSubmissionError(getUserSafeErrorMessage(error));
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardRoot}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.screen}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <MeridianScreenHeader
          title="Add patient"
          onBack={onBack}
          backTestID="new-patient-back-button"
          variant="task"
        />

        <View style={styles.form}>
          <Text style={styles.helper}>Full name is required. Phone is optional.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Full name</Text>
            <MeridianInput
              accessibilityLabel="Full name"
              autoCapitalize="words"
              autoComplete="name"
              onChangeText={(value) => {
                setFullName(value);
                setSubmissionError("");
              }}
              placeholder="Full name"
              testID="new-patient-fullname-input"
              value={fullName}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone</Text>
            <MeridianInput
              accessibilityLabel="Phone"
              autoComplete="tel"
              keyboardType="phone-pad"
              onChangeText={(value) => {
                setPhone(value);
                setSubmissionError("");
              }}
              placeholder="Phone number"
              testID="new-patient-phone-input"
              value={phone}
            />
          </View>

          {submissionError ? (
            <Text
              accessibilityLiveRegion="polite"
              style={styles.error}
              testID="new-patient-error-message"
            >
              {submissionError}
            </Text>
          ) : null}

          <MeridianButton
            accessibilityLabel="Save patient"
            disabled={!canSave}
            label={createPatient.isPending ? "Saving patient..." : "Save patient"}
            onPress={() => void handleSave()}
            testID="new-patient-save-button"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  screen: {
    flexGrow: 1,
    padding: meridian.spacing.lg,
    paddingBottom: meridian.spacing["2xl"],
  },
  form: {
    gap: meridian.spacing.lg,
    marginTop: meridian.spacing.lg,
  },
  helper: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  field: {
    gap: meridian.spacing.xs,
  },
  label: {
    ...typography.label,
    color: meridian.color.text,
  },
  error: {
    ...typography.body,
    color: meridian.color.destructive,
  },
});
