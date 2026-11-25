import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
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
import { useSendOtp } from "../../../features/auth/api/useVerifyOtp";
import { useGetProfile } from "../../../features/settings/api/useGetProfile";
import { useResetPassword } from "../../../features/settings/api/useResetPassword";
import {
  MeridianButton,
  MeridianCard,
  MeridianInput,
} from "../../../features/ui/meridian/primitives";
import { MeridianBackButton } from "../../../features/ui/meridian/BackButton";
import { meridian } from "../../../features/ui/meridian/tokens";
import { typography } from "../../../features/ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../../features/ui/userFacingErrors";
import type { OtpSendResponse } from "../../../../shared/contracts/auth";

const passwordResetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
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

const OTP_RESEND_LIMIT = 3;

type PasswordResetFormValues = z.infer<typeof passwordResetSchema>;

type PasswordChangeScreenProps = {
  onBack(): void;
};

export function PasswordChangeScreen({
  onBack,
}: PasswordChangeScreenProps): React.JSX.Element {
  const profile = useGetProfile();
  const { signOut } = useAuth();
  const sendOtp = useSendOtp();
  const resetPassword = useResetPassword();
  const [codeSent, setCodeSent] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [remainingResends, setRemainingResends] = useState(OTP_RESEND_LIMIT);

  const { control, handleSubmit, reset } = useForm<PasswordResetFormValues>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      code: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const email = profile.data?.email ?? "";

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  const sendCode = async () => {
    if (!email) {
      setErrorMessage("Profile email is required before password change.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await sendOtp.mutateAsync({ email });
      setCodeSent(result.sent || codeSent);
      applyOtpSendResult(result, {
        onSent: () => setStatusMessage("Verification code sent to your email."),
        onError: setErrorMessage,
        setRemainingResends,
        setSecondsRemaining,
      });
    } catch (error) {
      setErrorMessage(getUserSafeErrorMessage(error));
    }
  };

  const submit = handleSubmit(async (values) => {
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await resetPassword.mutateAsync({
        email,
        code: values.code,
        newPassword: values.newPassword,
      });
      reset();
      setCodeSent(false);
      setStatusMessage("Password changed.");
      await signOut();
    } catch {
      setErrorMessage("Invalid verification code. Please try again.");
    }
  });

  const isBusy = sendOtp.isPending || resetPassword.isPending || profile.isLoading;

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
              Send a verification code to your email, then set a new password.
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <MeridianCard>
          <View style={styles.cardStack}>
            <View>
              <Text style={styles.label}>Email</Text>
              <MeridianInput
                value={email}
                editable={false}
                style={styles.readOnlyInput}
                accessibilityLabel="Email"
                testID="password-email-input"
              />
            </View>

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

            <View style={styles.buttonContainer}>
              <MeridianButton
                label={
                  codeSent
                    ? secondsRemaining > 0
                      ? `Resend Code in ${secondsRemaining}s`
                      : remainingResends <= 0
                        ? "Resend limit reached"
                        : sendOtp.isPending
                          ? "Sending..."
                          : "Resend Code"
                    : sendOtp.isPending
                      ? "Sending..."
                      : "Send Code"
                }
                variant="secondary"
                onPress={sendCode}
                disabled={
                  isBusy ||
                  !email ||
                  (codeSent && (secondsRemaining > 0 || remainingResends <= 0))
                }
                testID="password-send-code-button"
              />
              {sendOtp.isPending ? (
                <View style={styles.spinnerOverlay}>
                  <ActivityIndicator color={meridian.color.primary} />
                </View>
              ) : null}
            </View>
            {codeSent ? (
              <Text style={styles.resendMeta}>
                {remainingResends} of {OTP_RESEND_LIMIT} resends remaining
              </Text>
            ) : null}

            <PasswordField
              control={control}
              name="code"
              label="Verification Code"
              placeholder="000000"
              editable={codeSent && !isBusy}
              keyboardType="number-pad"
              testID="password-code-input"
            />
            <PasswordField
              control={control}
              name="newPassword"
              label="New Password"
              placeholder="New password"
              editable={codeSent && !isBusy}
              secureTextEntry={!newPasswordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              inputStyle={styles.passwordInput}
              testID="password-newpassword-input"
              toggleButtonTestID="password-toggle-newpassword-visibility"
              onToggleVisibility={() =>
                setNewPasswordVisible((current) => !current)
              }
              visibilityLabel={newPasswordVisible ? "Hide password" : "Show password"}
            />
            <PasswordField
              control={control}
              name="confirmPassword"
              label="Confirm Password"
              placeholder="Confirm password"
              editable={codeSent && !isBusy}
              secureTextEntry={!confirmPasswordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              inputStyle={styles.passwordInput}
              testID="password-confirmpassword-input"
              toggleButtonTestID="password-toggle-confirmpassword-visibility"
              onToggleVisibility={() =>
                setConfirmPasswordVisible((current) => !current)
              }
              visibilityLabel={confirmPasswordVisible ? "Hide password" : "Show password"}
            />

            <MeridianButton
              label={resetPassword.isPending ? "Changing..." : "Save Password"}
              onPress={submit}
              disabled={!codeSent || isBusy}
              testID="password-save-button"
            />
          </View>
        </MeridianCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type PasswordFieldProps = {
  control: ReturnType<typeof useForm<PasswordResetFormValues>>["control"];
  name: keyof PasswordResetFormValues;
  label: string;
  placeholder: string;
  editable: boolean;
  keyboardType?: "default" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  inputStyle?: object;
  testID?: string;
  toggleButtonTestID?: string;
  onToggleVisibility?: () => void;
  visibilityLabel?: string;
};

function PasswordField({
  control,
  name,
  label,
  placeholder,
  editable,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  secureTextEntry,
  inputStyle,
  testID,
  toggleButtonTestID,
  onToggleVisibility,
  visibilityLabel,
}: PasswordFieldProps): React.JSX.Element {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value }, fieldState }) => (
          <View>
            <View
              style={[
                onToggleVisibility && styles.passwordRow,
                !editable && styles.disabledInput,
                fieldState.error && styles.inputError,
              ]}
            >
              <MeridianInput
                style={[
                  !onToggleVisibility && !editable && styles.disabledInput,
                  !onToggleVisibility && fieldState.error && styles.inputError,
                  inputStyle,
                ]}
                placeholder={placeholder}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize}
                autoCorrect={autoCorrect}
                secureTextEntry={secureTextEntry}
                onBlur={onBlur}
                onChangeText={(text) =>
                  name === "code"
                    ? onChange(text.replace(/\D/g, "").slice(0, 6))
                    : onChange(text)
                }
                value={value}
                editable={editable}
                accessibilityLabel={label}
                testID={testID}
              />
              {onToggleVisibility ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={visibilityLabel}
                  onPress={onToggleVisibility}
                  testID={toggleButtonTestID}
                  style={styles.visibilityButton}
                >
                  {secureTextEntry ? (
                    <Eye size={20} color={meridian.color.textSubtle} />
                  ) : (
                    <EyeOff size={20} color={meridian.color.textSubtle} />
                  )}
                </Pressable>
              ) : null}
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
  keyboardRoot: {
    flex: 1,
  },
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
  headerCopy: {
    flex: 1,
    gap: meridian.spacing.xs,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  title: {
    ...typography.display,
    color: meridian.color.text,
  },
  subtitle: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  cardStack: {
    gap: meridian.spacing.md,
  },
  formGroup: {
    gap: meridian.spacing.xs,
  },
  label: {
    ...typography.label,
    color: meridian.color.text,
  },
  readOnlyInput: {
    backgroundColor: meridian.color.surfaceMuted,
    color: meridian.color.textSubtle,
  },
  disabledInput: {
    backgroundColor: meridian.color.surfaceMuted,
  },
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
  statusContainer: {
    backgroundColor: meridian.color.primarySoft,
    borderRadius: meridian.radius.control,
    padding: meridian.spacing.md,
  },
  statusText: {
    ...typography.body,
    color: meridian.color.primary,
  },
  resendMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
    textAlign: "center",
  },
  buttonContainer: {
    position: "relative",
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});

function applyOtpSendResult(
  result: OtpSendResponse,
  callbacks: {
    onSent(): void;
    onError(message: string): void;
    setRemainingResends(value: number): void;
    setSecondsRemaining(value: number): void;
  },
): void {
  if (typeof result.remainingResends === "number") {
    callbacks.setRemainingResends(result.remainingResends);
  }
  if (typeof result.retryAfterSeconds === "number" && result.retryAfterSeconds > 0) {
    callbacks.setSecondsRemaining(result.retryAfterSeconds);
  }

  if (result.sent) {
    callbacks.onSent();
    return;
  }

  if (result.error === "otp_resend_too_soon") {
    callbacks.onError(
      `Wait ${result.retryAfterSeconds ?? 60}s before requesting another code.`,
    );
    return;
  }

  if (result.error === "otp_resend_limit_reached") {
    callbacks.onError("You have reached the resend limit for this code.");
    return;
  }

  callbacks.onError("We could not send a verification code right now.");
}
