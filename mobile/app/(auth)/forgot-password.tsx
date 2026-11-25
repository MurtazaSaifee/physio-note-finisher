import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { z } from "zod";
import { useForgotPassword } from "../../features/auth/api/useForgotPassword";
import { MeridianButton, MeridianCard, MeridianInput } from "../../features/ui/meridian/primitives";
import { meridian } from "../../features/ui/meridian/tokens";
import { typography } from "../../features/ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../features/ui/userFacingErrors";
import type { OtpSendResponse } from "../../../shared/contracts/auth";

const initiateSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const resetSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  newPassword: z.string().min(8, "Password must have at least 8 characters"),
});

const OTP_RESEND_LIMIT = 3;

type InitiateValues = z.infer<typeof initiateSchema>;
type ResetValues = z.infer<typeof resetSchema>;

type ForgotPasswordScreenProps = {
  onSuccess(): void;
  onBack(): void;
};

export function ForgotPasswordScreen({
  onSuccess,
  onBack,
}: ForgotPasswordScreenProps): React.JSX.Element {
  const [step, setStep] = useState<"initiate" | "reset">("initiate");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [remainingResends, setRemainingResends] = useState(OTP_RESEND_LIMIT);
  const { initiate, reset } = useForgotPassword();

  const initiateForm = useForm<InitiateValues>({
    resolver: zodResolver(initiateSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: { email: "" },
  });

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: "", newPassword: "" },
  });
  const initiateEmailValue = initiateForm.watch("email");
  const emailIsValid = initiateSchema.shape.email.safeParse(initiateEmailValue.trim()).success;
  const emailHasValue = initiateEmailValue.trim().length > 0;
  const showEmailValidationError = emailHasValue && !emailIsValid;

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  const onInitiate = initiateForm.handleSubmit(async (values) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await initiate.mutateAsync(values.email);
      setEmail(values.email);
      setStep("reset");
      applyOtpSendResult(result, {
        onSent: () => setStatusMessage("Verification code sent to your email."),
        onError: setErrorMessage,
        setRemainingResends,
        setSecondsRemaining,
      });
    } catch (e: any) {
      setErrorMessage(getUserSafeErrorMessage(e));
    }
  });

  const resendCode = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await initiate.mutateAsync(email);
      applyOtpSendResult(result, {
        onSent: () => setStatusMessage("Verification code sent to your email."),
        onError: setErrorMessage,
        setRemainingResends,
        setSecondsRemaining,
      });
    } catch (e: any) {
      setErrorMessage(getUserSafeErrorMessage(e));
    }
  };

  const onReset = resetForm.handleSubmit(async (values) => {
    setErrorMessage(null);
    try {
      await reset.mutateAsync({
        email,
        code: values.code,
        newPassword: values.newPassword,
      });
      onSuccess();
    } catch (e: any) {
      setErrorMessage(getUserSafeErrorMessage(e));
    }
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <MeridianCard>
        <View style={styles.header}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            {step === "initiate"
              ? "Enter your email to receive a verification code."
              : `Enter the code sent to your email and choose a new password.`}
          </Text>
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

        {step === "initiate" ? (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address</Text>
            <Controller
              control={initiateForm.control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <View>
                  <MeridianInput
                    style={showEmailValidationError ? styles.inputError : undefined}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="name@clinic.com"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    editable={!initiate.isPending}
                    testID="forgotpassword-email-input"
                  />
                  {showEmailValidationError ? (
                    <Text style={styles.validationError}>Enter a valid email address</Text>
                  ) : null}
                </View>
              )}
            />
            {!emailHasValue ? (
              <Text style={styles.actionHint}>
                Enter your email address to enable Send Reset Code.
              </Text>
            ) : null}
            <View style={styles.buttonContainer}>
              <MeridianButton
                label={initiate.isPending ? "Sending..." : "Send Reset Code"}
                onPress={onInitiate}
                disabled={initiate.isPending || !emailIsValid}
                testID="forgotpassword-send-button"
              />
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Verification Code</Text>
              <Controller
                control={resetForm.control}
                name="code"
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <View>
                    <MeridianInput
                      keyboardType="number-pad"
                      placeholder="000000"
                      onBlur={onBlur}
                      onChangeText={(text) =>
                        onChange(text.replace(/\D/g, "").slice(0, 6))
                      }
                      value={value}
                      editable={!reset.isPending}
                      testID="forgotpassword-code-input"
                    />
                    {fieldState.error && (
                      <Text style={styles.validationError}>{fieldState.error.message}</Text>
                    )}
                  </View>
                )}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>New Password</Text>
              <Controller
                control={resetForm.control}
                name="newPassword"
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <View>
                    <View
                      style={[
                        styles.passwordRow,
                        fieldState.error && styles.passwordRowError,
                      ]}
                    >
                      <MeridianInput
                        style={styles.passwordInput}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!passwordVisible}
                        placeholder="Minimum 8 characters"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                        editable={!reset.isPending}
                        testID="forgotpassword-newpassword-input"
                      />
                      <Pressable
                        onPress={() => setPasswordVisible((current) => !current)}
                        style={styles.eyeButton}
                        testID="forgotpassword-toggle-password-visibility"
                        accessibilityRole="button"
                        accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
                      >
                        {passwordVisible ? (
                          <EyeOff size={20} color={meridian.color.textSubtle} />
                        ) : (
                          <Eye size={20} color={meridian.color.textSubtle} />
                        )}
                      </Pressable>
                    </View>
                    {fieldState.error && (
                      <Text style={styles.validationError}>{fieldState.error.message}</Text>
                    )}
                  </View>
                )}
              />
            </View>
            <View style={styles.buttonContainer}>
              <MeridianButton
                label={
                  secondsRemaining > 0
                    ? `Resend Code in ${secondsRemaining}s`
                    : remainingResends <= 0
                      ? "Resend limit reached"
                      : initiate.isPending
                        ? "Sending..."
                        : "Resend Code"
                }
                variant="secondary"
                onPress={() => void resendCode()}
                disabled={initiate.isPending || secondsRemaining > 0 || remainingResends <= 0}
                testID="forgotpassword-resend-button"
              />
              <Text style={styles.resendMeta}>
                {remainingResends} of {OTP_RESEND_LIMIT} resends remaining
              </Text>
              <MeridianButton
                label={reset.isPending ? "Resetting..." : "Reset Password"}
                onPress={onReset}
                disabled={reset.isPending}
                testID="forgotpassword-reset-button"
              />
            </View>
          </View>
        )}

        <MeridianButton
          label="Back to Sign In"
          variant="ghost"
          onPress={onBack}
          disabled={initiate.isPending || reset.isPending}
          testID="forgotpassword-back-button"
        />
      </MeridianCard>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  header: {
    marginBottom: meridian.spacing.lg,
  },
  title: {
    ...typography.display,
    color: meridian.color.text,
    marginBottom: meridian.spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  formGroup: {
    marginBottom: meridian.spacing.lg,
  },
  label: {
    ...typography.label,
    color: meridian.color.text,
    marginBottom: meridian.spacing.xs,
  },
  inputError: {
    borderColor: meridian.color.destructive,
    backgroundColor: meridian.color.errorSurface,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: meridian.color.border,
    borderWidth: 1,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.surface,
    paddingHorizontal: meridian.spacing.md,
    minHeight: meridian.touchTarget.hit,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: meridian.spacing.sm,
  },
  eyeButton: {
    padding: meridian.spacing.xs,
  },
  passwordRowError: {
    borderColor: meridian.color.destructive,
    backgroundColor: meridian.color.errorSurface,
  },
  validationError: {
    ...typography.label,
    color: meridian.color.destructive,
    marginTop: meridian.spacing.xs,
  },
  actionHint: {
    ...typography.label,
    color: meridian.color.textSubtle,
    marginTop: meridian.spacing.xs,
    marginBottom: meridian.spacing.sm,
  },
  errorContainer: {
    backgroundColor: meridian.color.errorSurface,
    borderWidth: 1,
    borderColor: meridian.color.errorBorder,
    padding: meridian.spacing.md,
    borderRadius: meridian.radius.control,
    marginBottom: meridian.spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: meridian.color.destructive,
  },
  statusContainer: {
    backgroundColor: meridian.color.primarySoft,
    padding: meridian.spacing.md,
    borderRadius: meridian.radius.control,
    marginBottom: meridian.spacing.lg,
  },
  statusText: {
    ...typography.body,
    color: meridian.color.primary,
  },
  buttonContainer: {
    marginTop: meridian.spacing.md,
    marginBottom: meridian.spacing.sm,
  },
  resendMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
    textAlign: "center",
    marginBottom: meridian.spacing.sm,
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
