import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useState } from "react";
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
  type KeyboardTypeOptions,
} from "react-native";
import { z } from "zod";

import { CLINICIAN_DATA_HANDLING_ACKNOWLEDGEMENT_VERSION } from "../../../shared/contracts/auth";
import { useSignup } from "../../features/auth/api/useSignup";
import {
  MeridianButton,
  MeridianCard,
  MeridianInput,
} from "../../features/ui/meridian/primitives";
import { meridian } from "../../features/ui/meridian/tokens";
import { typography } from "../../features/ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../features/ui/userFacingErrors";

const signupSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must have at least 8 characters").max(128),
  dataHandlingAcknowledged: z
    .boolean()
    .refine((value) => value, "Please acknowledge authorized clinical documentation use"),
});

export type SignUpFormValues = z.infer<typeof signupSchema>;

type SignUpScreenProps = {
  onOtpRequired(email: string): void;
  onBackToSignIn(): void;
};

export function SignUpScreen({
  onOtpRequired,
  onBackToSignIn,
}: SignUpScreenProps): React.JSX.Element {
  const signup = useSignup();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signupSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      dataHandlingAcknowledged: false,
    },
  });

  const submit = handleSubmit(async (values) => {
    setErrorMessage(null);
    try {
      const { dataHandlingAcknowledged: _dataHandlingAcknowledged, ...signupValues } = values;
      const result = await signup.mutateAsync({
        ...signupValues,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        acknowledgementVersion: CLINICIAN_DATA_HANDLING_ACKNOWLEDGEMENT_VERSION,
      });
      onOtpRequired(result.user.email);
    } catch (error) {
      setErrorMessage(getUserSafeErrorMessage(error));
    }
  });

  const isSubmitting = signup.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <MeridianCard>
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Set up your Physio Note Finisher clinician account.</Text>
          </View>

          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <FormField
            control={control}
            name="firstName"
            label="First Name"
            placeholder="Ada"
            editable={!isSubmitting}
            autoCapitalize="words"
            testID="signup-firstname-input"
          />
          <FormField
            control={control}
            name="lastName"
            label="Last Name"
            placeholder="Lovelace"
            editable={!isSubmitting}
            autoCapitalize="words"
            testID="signup-lastname-input"
          />

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => {
                const trimmedValue = value.trim();
                const showEmailValidationError =
                  trimmedValue.length > 0 &&
                  !signupSchema.shape.email.safeParse(trimmedValue).success;

                return (
                  <View>
                    <MeridianInput
                      style={showEmailValidationError ? styles.inputError : undefined}
                      placeholder="name@clinic.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      editable={!isSubmitting}
                      testID="signup-email-input"
                    />
                    {showEmailValidationError ? (
                      <Text style={styles.validationError}>Enter a valid email address</Text>
                    ) : null}
                  </View>
                );
              }}
            />
          </View>

          <Controller
            control={control}
            name="dataHandlingAcknowledged"
            render={({ field: { onChange, value }, fieldState }) => (
              <View style={styles.acknowledgementGroup}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: value, disabled: isSubmitting }}
                  disabled={isSubmitting}
                  onPress={() => onChange(!value)}
                  style={styles.acknowledgementRow}
                  testID="signup-data-handling-acknowledgement-checkbox"
                >
                  <View style={[styles.checkbox, value && styles.checkboxChecked]}>
                    {value ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.acknowledgementText}>
                    I acknowledge that I will use this app for authorized clinical documentation.
                  </Text>
                </Pressable>
                {fieldState.error ? (
                  <Text style={styles.validationError}>{fieldState.error.message}</Text>
                ) : null}
              </View>
            )}
          />

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
                      fieldState.error && styles.inputError,
                    ]}
                  >
                    <MeridianInput
                      style={styles.passwordInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!passwordVisible}
                      placeholder="Create a password"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      editable={!isSubmitting}
                      testID="signup-password-input"
                    />
                    <Pressable
                      onPress={() => setPasswordVisible((v) => !v)}
                      style={styles.eyeButton}
                      testID="signup-toggle-password-visibility"
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
                  {fieldState.error ? (
                    <Text style={styles.validationError}>{fieldState.error.message}</Text>
                  ) : null}
                </View>
              )}
            />
          </View>

          <View style={styles.buttonContainer}>
            <MeridianButton
              label={isSubmitting ? "Creating..." : "Create Account"}
              variant="primary"
              onPress={submit}
              disabled={isSubmitting || !isValid}
              testID="signup-submit-button"
            />
            {isSubmitting ? (
              <View style={styles.spinnerOverlay}>
                <ActivityIndicator color={meridian.color.surface} />
              </View>
            ) : null}
          </View>

          <View style={styles.loginFooter}>
            <Text style={styles.loginFooterText}>Already have an account? </Text>
            <Pressable
              onPress={onBackToSignIn}
              testID="signup-back-button"
              accessibilityRole="link"
              accessibilityLabel="Log in here"
            >
              <Text style={styles.loginFooterLink}>Log in here</Text>
            </Pressable>
          </View>
        </MeridianCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FormFieldProps = {
  control: ReturnType<typeof useForm<SignUpFormValues>>["control"];
  name: "firstName" | "lastName";
  label: string;
  placeholder: string;
  editable: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  showValidationMessage?: boolean;
  testID?: string;
};

function FormField({
  control,
  name,
  label,
  placeholder,
  editable,
  keyboardType,
  autoCapitalize,
  showValidationMessage = true,
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
            <MeridianInput
              style={fieldState.error ? styles.inputError : undefined}
              placeholder={placeholder}
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              editable={editable}
              testID={testID}
            />
            {fieldState.error && showValidationMessage ? (
              <Text style={styles.validationError}>{fieldState.error.message}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: meridian.spacing.xl,
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
    gap: meridian.spacing.xs,
  },
  label: {
    ...typography.label,
    color: meridian.color.text,
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
  acknowledgementGroup: {
    marginBottom: meridian.spacing.lg,
  },
  acknowledgementRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: meridian.spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: meridian.color.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: meridian.color.primary,
    borderColor: meridian.color.primary,
  },
  checkboxMark: {
    color: meridian.color.surface,
    fontWeight: "700",
  },
  acknowledgementText: {
    ...typography.body,
    color: meridian.color.text,
    flex: 1,
  },
  loginFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: meridian.spacing.sm,
  },
  loginFooterText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  loginFooterLink: {
    ...typography.label,
    color: meridian.color.primary,
  },
});
