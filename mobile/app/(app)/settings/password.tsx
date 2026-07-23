import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { z } from "zod";

import { useAuth } from "../../../features/auth/providers/AuthProvider";
import { useChangePassword } from "../../../features/settings/api/useChangePassword";
import { MeridianBackButton } from "../../../features/ui/meridian/BackButton";
import {
  MeridianButton,
  MeridianCard,
  MeridianInput,
} from "../../../features/ui/meridian/primitives";
import { meridian } from "../../../features/ui/meridian/tokens";
import { typography } from "../../../features/ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../../features/ui/userFacingErrors";

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(8, "Password must have at least 8 characters")
      .max(128),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

type PasswordChangeScreenProps = {
  onBack(): void;
};

export function PasswordChangeScreen({
  onBack,
}: PasswordChangeScreenProps): React.JSX.Element {
  const { signOut } = useAuth();
  const changePassword = useChangePassword();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const { control, handleSubmit } = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setErrorMessage(null);
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      await signOut();
    } catch (error) {
      setErrorMessage(getUserSafeErrorMessage(error));
    }
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardRoot}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <MeridianBackButton onPress={onBack} testID="password-back-button" />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Change Password</Text>
            <Text style={styles.subtitle}>
              Confirm your current password, then choose a new one.
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <MeridianCard>
          <View style={styles.cardStack}>
            {errorMessage ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <PasswordField
              control={control}
              name="currentPassword"
              label="Current Password"
              testID="password-current-input"
              visible={currentPasswordVisible}
              onToggleVisibility={() =>
                setCurrentPasswordVisible((current) => !current)
              }
            />
            <PasswordField
              control={control}
              name="newPassword"
              label="New Password"
              testID="password-newpassword-input"
              visible={newPasswordVisible}
              onToggleVisibility={() =>
                setNewPasswordVisible((current) => !current)
              }
            />
            <PasswordField
              control={control}
              name="confirmPassword"
              label="Confirm Password"
              testID="password-confirmpassword-input"
              visible={confirmPasswordVisible}
              onToggleVisibility={() =>
                setConfirmPasswordVisible((current) => !current)
              }
            />

            <MeridianButton
              label={changePassword.isPending ? "Changing..." : "Save Password"}
              onPress={submit}
              disabled={changePassword.isPending}
              testID="password-save-button"
            />
          </View>
        </MeridianCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type PasswordFieldProps = {
  control: ReturnType<typeof useForm<PasswordChangeFormValues>>["control"];
  name: keyof PasswordChangeFormValues;
  label: string;
  testID: string;
  visible: boolean;
  onToggleVisibility(): void;
};

function PasswordField({
  control,
  name,
  label,
  testID,
  visible,
  onToggleVisibility,
}: PasswordFieldProps): React.JSX.Element {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value }, fieldState }) => (
          <View>
            <View style={[styles.passwordRow, fieldState.error && styles.inputError]}>
              <MeridianInput
                style={styles.passwordInput}
                placeholder={label}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!visible}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                accessibilityLabel={label}
                testID={testID}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
                onPress={onToggleVisibility}
                testID={`${testID}-visibility-button`}
                style={styles.visibilityButton}
              >
                {visible ? (
                  <EyeOff size={20} color={meridian.color.textSubtle} />
                ) : (
                  <Eye size={20} color={meridian.color.textSubtle} />
                )}
              </Pressable>
            </View>
            {fieldState.error ? (
              <Text style={styles.validationError}>{fieldState.error.message}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: { flex: 1 },
  container: {
    padding: meridian.spacing.lg,
    gap: meridian.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.sm,
  },
  headerCopy: { flex: 1, gap: meridian.spacing.xs },
  headerSpacer: { width: 44, height: 44 },
  title: { ...typography.display, color: meridian.color.text },
  subtitle: { ...typography.body, color: meridian.color.textSubtle },
  cardStack: { gap: meridian.spacing.md },
  formGroup: { gap: meridian.spacing.xs },
  label: { ...typography.label, color: meridian.color.text },
  passwordRow: {
    alignItems: "center",
    backgroundColor: meridian.color.surface,
    borderColor: meridian.color.border,
    borderRadius: meridian.radius.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: meridian.touchTarget.hit,
    paddingLeft: meridian.spacing.md,
    paddingRight: meridian.spacing.sm,
  },
  passwordInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    flex: 1,
    paddingHorizontal: 0,
  },
  inputError: {
    borderColor: meridian.color.destructive,
    backgroundColor: meridian.color.errorSurface,
  },
  visibilityButton: {
    alignItems: "center",
    height: meridian.touchTarget.hit,
    justifyContent: "center",
    width: meridian.touchTarget.hit,
  },
  validationError: {
    ...typography.label,
    color: meridian.color.destructive,
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
});
