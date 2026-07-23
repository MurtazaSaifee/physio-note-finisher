import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { z } from "zod";
import { meridian } from "../../features/ui/meridian/tokens";
import { typography } from "../../features/ui/meridian/typography";
import { MeridianCard, MeridianInput, MeridianButton } from "../../features/ui/meridian/primitives";
import { getUserSafeErrorMessage } from "../../features/ui/userFacingErrors";

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must have at least 8 characters"),
});

export type SignInFormValues = z.infer<typeof signInSchema>;

type SignInScreenProps = {
  onSubmit(values: SignInFormValues): Promise<void> | void;
  onForgotPassword?(): void;
  defaultValues?: Partial<SignInFormValues>;
};

export function SignInScreen({
  onSubmit,
  defaultValues,
}: SignInScreenProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const { control, handleSubmit } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: defaultValues?.email ?? "clinician@example.com",
      password: defaultValues?.password ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (e: any) {
      setErrorMessage(
        getUserSafeErrorMessage(
          e,
          "We could not sign you in. Check your email and password, then try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <MeridianCard>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Welcome back. Sign in to your clinic.</Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email Address</Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value }, fieldState }) => (
              <View>
                <MeridianInput
                  style={fieldState.error ? styles.inputError : undefined}
                  autoCapitalize="none"
                  autoComplete="off"
                  keyboardType="email-address"
                  placeholder="clinician@example.com"
                  importantForAutofill="no"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  testID="signin-email-input"
                />
                {fieldState.error && (
                  <Text style={styles.validationError}>{fieldState.error.message}</Text>
                )}
              </View>
            )}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Password</Text>
          <Controller
            control={control}
            name="password"
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
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    placeholder="Enter your password"
                    importantForAutofill="no"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    onSubmitEditing={() => {
                      void submit();
                    }}
                    value={value}
                    secureTextEntry={!passwordVisible}
                    testID="signin-password-input"
                  />
                  <Pressable
                    disabled={isSubmitting}
                    onPress={() => setPasswordVisible((current) => !current)}
                    style={styles.eyeButton}
                    testID="signin-toggle-password-visibility"
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
            label={isSubmitting ? "Signing in..." : "Sign In"}
            variant="primary"
            onPress={submit}
            disabled={isSubmitting}
            testID="login-submit-button"
          />
          {isSubmitting && (
            <View style={styles.spinnerOverlay}>
              <ActivityIndicator color={meridian.color.surface} />
            </View>
          )}
        </View>
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
  inputError: {
    borderColor: meridian.color.destructive,
    backgroundColor: meridian.color.errorSurface,
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
  buttonContainer: {
    marginTop: meridian.spacing.xs,
    position: "relative",
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
