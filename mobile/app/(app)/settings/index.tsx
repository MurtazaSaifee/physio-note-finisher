import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { z } from "zod";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGetProfile } from "../../../features/settings/api/useGetProfile";
import { useUpdateProfile } from "../../../features/settings/api/useUpdateProfile";
import { useUpdateRetentionPolicy } from "../../../features/settings/api/useUpdateRetentionPolicy";
import { useAuth } from "../../../features/auth/providers/AuthProvider";
import {
  MeridianButton,
  MeridianCard,
} from "../../../features/ui/meridian/primitives";
import { meridian } from "../../../features/ui/meridian/tokens";
import { typography } from "../../../features/ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../../features/ui/userFacingErrors";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().email(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

type ClinicalSettingsScreenProps = {
  onOpenPasswordChange(): void;
};

export function ClinicalSettingsScreen({
  onOpenPasswordChange,
}: ClinicalSettingsScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const profile = useGetProfile();
  const updateProfile = useUpdateProfile();
  const updateRetentionPolicy = useUpdateRetentionPolicy();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retentionStatus, setRetentionStatus] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
    },
  });
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!profile.data || hasInitialized.current) {
      return;
    }

    reset({
      firstName: profile.data.firstName,
      lastName: profile.data.lastName,
      email: profile.data.email,
    });
    hasInitialized.current = true;
  }, [profile.data, reset]);

  const submit = handleSubmit(async (values) => {
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await updateProfile.mutateAsync({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
      });
      setStatusMessage("Profile updated.");
    } catch (error) {
      setErrorMessage(getUserSafeErrorMessage(error));
    }
  });

  const isBusy = updateProfile.isPending;
  const initials = profile.data
    ? `${profile.data.firstName[0] ?? ""}${profile.data.lastName[0] ?? ""}`.toUpperCase()
    : "DR";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardRoot}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: meridian.spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileHeaderText}>
            <Text style={styles.profileName}>
              {profile.data ? `${profile.data.firstName} ${profile.data.lastName}` : "Clinician"}
            </Text>
            <Text style={styles.brandText}>Physio Note Finisher</Text>
          </View>
        </View>

        <MeridianCard>
          <View style={styles.cardStack}>
            <View>
              <Text style={styles.sectionTitle}>Profile</Text>
              <Text style={styles.sectionSubtitle}>
                Email stays fixed after account creation.
              </Text>
            </View>

            {profile.isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={meridian.color.primary} />
                <Text style={styles.loadingText}>Loading profile...</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {statusMessage ? (
              <View style={styles.statusContainer}>
                <Text style={styles.statusText}>{statusMessage}</Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <UnderlineFormField
                control={control}
                name="firstName"
                label="First Name"
                placeholder="Mira"
                editable={!isBusy}
                testID="settings-firstname-input"
              />
              <UnderlineFormField
                control={control}
                name="lastName"
                label="Last Name"
                placeholder="Shah"
                editable={!isBusy}
                testID="settings-lastname-input"
              />
            </View>

            <UnderlineFormField
              control={control}
              name="email"
              label="Email"
              placeholder="name@clinic.com"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={false}
              readOnly
              testID="settings-email-input"
            />

            <MeridianButton
              label={isBusy ? "Saving..." : "Save Changes"}
              onPress={submit}
              disabled={isBusy || profile.isLoading}
              testID="settings-save-button"
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              testID="settings-logout-button"
              onPress={() => void signOut()}
            >
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          </View>
        </MeridianCard>

        <MeridianCard tonal>
          <View style={styles.cardStack}>
            <View>
              <Text style={styles.sectionTitle}>Password</Text>
              <Text style={styles.sectionSubtitle}>
                Send a verification code to your email, then set a new password.
              </Text>
            </View>

            <MeridianButton
              label="Change Password"
              variant="primary"
              onPress={onOpenPasswordChange}
              testID="settings-change-password-button"
            />
          </View>
        </MeridianCard>

        <MeridianCard>
          <View style={styles.cardStack}>
            <View>
              <Text style={styles.sectionTitle}>Audio Retention</Text>
              <Text style={styles.sectionSubtitle}>
                How long to keep recordings and transcripts.
              </Text>
            </View>

            {profile.isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={meridian.color.primary} />
                <Text style={styles.loadingText}>Loading preferences...</Text>
              </View>
            ) : null}

            {retentionStatus ? (
              <View style={styles.statusContainer}>
                <Text style={styles.statusText}>{retentionStatus}</Text>
              </View>
            ) : null}

            <View style={styles.timingOptions}>
              {([
                { value: "7d", label: "7 days" },
                { value: "30d", label: "30 days" },
                { value: "90d", label: "90 days" },
                { value: "forever", label: "Keep forever" },
              ] as const).map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{
                    selected: profile.data?.audioRetentionPeriod === option.value,
                  }}
                  testID={`settings-retention-${option.value}`}
                  disabled={updateRetentionPolicy.isPending}
                  onPress={() => {
                    setRetentionStatus(null);
                    updateRetentionPolicy
                      .mutateAsync({
                        audioRetentionPeriod: option.value,
                      })
                      .then(() => {
                        setRetentionStatus("Retention policy updated.");
                      })
                      .catch(() => {
                        setRetentionStatus("Unable to update retention policy.");
                      });
                  }}
                  style={({ pressed }) => [
                    styles.timingOption,
                    profile.data?.audioRetentionPeriod === option.value &&
                      styles.timingOptionSelected,
                    pressed && styles.pressed,
                    updateRetentionPolicy.isPending && styles.timingOptionDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.timingOptionText,
                      profile.data?.audioRetentionPeriod === option.value &&
                        styles.timingOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {profile.data?.audioRetentionPeriod === "forever" ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>
                  Keeping recordings forever increases storage costs and privacy
                  risk. Consider a shorter retention period.
                </Text>
              </View>
            ) : null}
          </View>
        </MeridianCard>

        <View style={styles.footer}>
          <Text style={styles.version}>App Version 0.1.0</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FormFieldProps = {
  control: ReturnType<typeof useForm<ProfileFormValues>>["control"];
  name: keyof ProfileFormValues;
  label: string;
  placeholder: string;
  editable: boolean;
  readOnly?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  testID?: string;
};

function UnderlineFormField({
  control,
  name,
  label,
  placeholder,
  editable,
  readOnly = false,
  keyboardType,
  autoCapitalize,
  testID,
}: FormFieldProps): React.JSX.Element {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value }, fieldState }) => (
          <View>
            <TextInput
              style={[
                styles.underlineInput,
                readOnly && styles.readOnlyInput,
                fieldState.error && styles.inputError,
              ]}
              placeholder={placeholder}
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              onBlur={onBlur}
              onChangeText={readOnly ? undefined : onChange}
              value={value}
              editable={editable}
              accessibilityLabel={label}
              testID={testID}
              placeholderTextColor={meridian.color.textSubtle}
            />
            {fieldState.error && !readOnly ? (
              <Text style={styles.validationError}>{fieldState.error.message}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  container: {
    padding: meridian.spacing.lg,
    gap: meridian.spacing.md,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.md,
    marginBottom: meridian.spacing.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.heading,
    color: meridian.color.primary,
    fontSize: 20,
  },
  profileHeaderText: {
    gap: meridian.spacing.xs,
  },
  profileName: {
    ...typography.heading,
    fontSize: 18,
  },
  brandText: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cardStack: {
    gap: meridian.spacing.md,
  },
  sectionTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  sectionSubtitle: {
    ...typography.body,
    color: meridian.color.textSubtle,
    marginTop: meridian.spacing.xs,
  },
  row: {
    flexDirection: "row",
    gap: meridian.spacing.md,
  },
  formGroup: {
    flex: 1,
    gap: meridian.spacing.xs,
  },
  label: {
    ...typography.label,
    color: meridian.color.text,
  },
  underlineInput: {
    ...typography.body,
    borderBottomWidth: 1,
    borderBottomColor: meridian.color.border,
    paddingVertical: meridian.spacing.sm,
    color: meridian.color.text,
  },
  readOnlyInput: {
    color: meridian.color.textSubtle,
    borderBottomColor: meridian.color.surfaceMuted,
  },
  inputError: {
    borderBottomColor: meridian.color.destructive,
  },
  validationError: {
    ...typography.label,
    color: meridian.color.destructive,
    marginTop: meridian.spacing.xs,
  },
  logoutText: {
    ...typography.label,
    color: meridian.color.destructive,
    textAlign: "center",
    paddingVertical: meridian.spacing.sm,
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: meridian.spacing.sm,
  },
  loadingText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  errorContainer: {
    backgroundColor: meridian.color.errorSurface,
    borderColor: meridian.color.errorBorder,
    borderRadius: meridian.radius.control,
    borderWidth: 1,
    padding: meridian.spacing.md,
  },
  errorText: {
    ...typography.body,
    color: meridian.color.destructive,
  },
  statusContainer: {
    backgroundColor: meridian.color.primarySoft,
    borderRadius: meridian.radius.control,
    padding: meridian.spacing.md,
  },
  statusText: {
    ...typography.body,
    color: meridian.color.primary,
  },
  footer: {
    alignItems: "center",
    gap: meridian.spacing.xs,
    paddingBottom: meridian.spacing.md,
    paddingTop: meridian.spacing.sm,
  },
  version: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontSize: 11,
  },
  timingOptions: {
    gap: meridian.spacing.sm,
  },
  timingOption: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.control,
    paddingHorizontal: meridian.spacing.md,
    paddingVertical: meridian.spacing.sm,
  },
  timingOptionSelected: {
    backgroundColor: meridian.color.primarySoft,
    borderWidth: 1,
    borderColor: meridian.color.primary,
  },
  timingOptionDisabled: {
    opacity: 0.5,
  },
  timingOptionText: {
    ...typography.body,
    color: meridian.color.text,
  },
  timingOptionTextSelected: {
    color: meridian.color.primary,
    fontWeight: "600",
  },
  banner: {
    backgroundColor: meridian.color.errorSurface,
    borderRadius: meridian.radius.control,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
  },
  bannerText: {
    ...typography.body,
    color: meridian.color.destructive,
  },
  pressed: {
    opacity: 0.8,
  },
});
