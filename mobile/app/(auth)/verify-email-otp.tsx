import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { z } from "zod";

import { useSendOtp, useVerifyOtp } from "../../features/auth/api/useVerifyOtp";
import {
  MeridianButton,
  MeridianCard,
  MeridianInput,
} from "../../features/ui/meridian/primitives";
import { meridian } from "../../features/ui/meridian/tokens";
import { typography } from "../../features/ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../features/ui/userFacingErrors";
import type { OtpSendResponse } from "../../../shared/contracts/auth";

const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

const OTP_RESEND_LIMIT = 3;

type OtpFormValues = z.infer<typeof otpSchema>;

type VerifyEmailOtpScreenProps = {
  email: string;
  onVerified(tokens: { accessToken: string; refreshToken: string }): Promise<void> | void;
  onBackToSignup(): void;
};

export function VerifyEmailOtpScreen({
  email,
  onVerified,
  onBackToSignup,
}: VerifyEmailOtpScreenProps): React.JSX.Element {
  const verifyOtp = useVerifyOtp();
  const sendOtp = useSendOtp();
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [remainingResends, setRemainingResends] = useState(OTP_RESEND_LIMIT);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      code: "",
    },
  });

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  const submit = handleSubmit(async (values) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const tokens = await verifyOtp.mutateAsync({
        email,
        code: values.code,
      });
      await onVerified(tokens);
    } catch {
      setErrorMessage("Invalid verification code. Please try again.");
    }
  });

  const resend = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await sendOtp.mutateAsync({ email });
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

  const isSubmitting = verifyOtp.isPending;
  const isResending = sendOtp.isPending;
  const resendDisabled =
    secondsRemaining > 0 || remainingResends <= 0 || isResending || isSubmitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <MeridianCard>
        <View style={styles.header}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to {email}.
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

        <View style={styles.formGroup}>
          <Text style={styles.label}>Verification Code</Text>
          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value }, fieldState }) => (
              <View>
                <MeridianInput
                  style={[styles.codeInput, fieldState.error && styles.inputError]}
                  keyboardType="number-pad"
                  placeholder="000000"
                  onBlur={onBlur}
                  onChangeText={(text) =>
                    onChange(text.replace(/\D/g, "").slice(0, 6))
                  }
                  value={value}
                  editable={!isSubmitting}
                  testID="verifyemailotp-code-input"
                />
                {fieldState.error ? (
                  <Text style={styles.validationError}>{fieldState.error.message}</Text>
                ) : null}
              </View>
            )}
          />
        </View>

        <View style={styles.buttonContainer}>
          <MeridianButton
            label={isSubmitting ? "Verifying..." : "Verify Email"}
            variant="primary"
            onPress={submit}
            disabled={isSubmitting}
            testID="verifyemailotp-submit-button"
          />
          {isSubmitting ? (
            <View style={styles.spinnerOverlay}>
              <ActivityIndicator color={meridian.color.surface} />
            </View>
          ) : null}
        </View>

        <MeridianButton
          label={
            secondsRemaining > 0
              ? `Resend Code in ${secondsRemaining}s`
              : remainingResends <= 0
                ? "Resend limit reached"
              : isResending
                ? "Sending..."
                : "Resend Code"
          }
          variant="secondary"
          onPress={resend}
          disabled={resendDisabled}
          testID="verifyemailotp-resend-button"
        />
        <Text style={styles.resendMeta}>
          {remainingResends} of {OTP_RESEND_LIMIT} resends remaining
        </Text>

        <MeridianButton
          label="Back"
          variant="ghost"
          onPress={onBackToSignup}
          disabled={isSubmitting}
          testID="verifyemailotp-back-button"
        />
      </MeridianCard>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  header: {
    marginBottom: meridian.spacing.xl,
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
  codeInput: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: 0,
  },
  inputError: {
    borderColor: meridian.color.destructive,
    backgroundColor: meridian.color.errorSurface,
  },
  validationError: {
    ...typography.label,
    color: meridian.color.destructive,
    marginTop: meridian.spacing.xs,
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
  resendMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
    marginTop: meridian.spacing.sm,
    marginBottom: meridian.spacing.md,
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: meridian.spacing.xs,
    marginBottom: meridian.spacing.sm,
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
