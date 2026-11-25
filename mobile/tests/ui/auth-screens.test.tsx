import { beforeEach, describe, it, expect, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const authHookState = vi.hoisted(() => ({
  signup: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  verifyOtp: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  sendOtp: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
}));

import { SignInScreen } from "../../app/(auth)/sign-in";
import { SignUpScreen } from "../../app/(auth)/sign-up";
import { VerifyEmailOtpScreen } from "../../app/(auth)/verify-email-otp";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  ActivityIndicator: "ActivityIndicator",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    absoluteFillObject: {},
  },
}));

vi.mock("expo-status-bar", () => ({
  StatusBar: "StatusBar",
}));

vi.mock("lucide-react-native", () => ({
  Eye: "Eye",
  EyeOff: "EyeOff",
}));

// Mock hooks
vi.mock("../../features/auth/api/useSignup", () => ({
  useSignup: () => authHookState.signup,
}));

vi.mock("../../features/auth/api/useVerifyOtp", () => ({
  useVerifyOtp: () => authHookState.verifyOtp,
  useSendOtp: () => authHookState.sendOtp,
}));

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Failed to render");
  return renderer;
}

function collectText(node: any): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  const children = node.children ?? [];
  return [
    typeof node === "string" ? node : "",
    ...children.map((child: any) => typeof child === "string" ? child : collectText(child)),
  ].filter(Boolean).join(" ");
}

function findInputByPlaceholder(
  renderer: TestRenderer.ReactTestRenderer,
  placeholder: string,
) {
  const input = renderer.root
    .findAllByProps({ placeholder })
    .find((node) => typeof node.props.onChangeText === "function");

  if (!input) {
    throw new Error(`Missing input for placeholder "${placeholder}"`);
  }

  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
  authHookState.signup.isPending = false;
  authHookState.verifyOtp.isPending = false;
  authHookState.sendOtp.isPending = false;
  authHookState.signup.mutateAsync.mockReset().mockResolvedValue({
    user: { email: "clinician@example.com" },
  });
  authHookState.verifyOtp.mutateAsync.mockReset().mockResolvedValue(undefined);
  authHookState.sendOtp.mutateAsync.mockReset().mockResolvedValue(undefined);
});

describe("Auth Screens UI", () => {
  it("keeps Sign In content-height sized and leaves branding to the shared auth shell", async () => {
    const renderer = await render(
      <SignInScreen onSubmit={vi.fn()} onForgotPassword={vi.fn()} />,
    );
    const container = renderer.root.findByType("KeyboardAvoidingView");

    expect(collectText(renderer.toJSON())).not.toContain("Physio Note Finisher");
    expect(container.props.style).toMatchObject({ width: "100%" });
    expect(container.props.style).not.toHaveProperty("flex", 1);
  });

  describe("SignInScreen", () => {
    it("submits when the password field uses the keyboard action", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const renderer = await render(
        <SignInScreen
          onSubmit={onSubmit}
          onForgotPassword={vi.fn()}
          defaultValues={{
            email: "clinician@example.com",
            password: "password123",
          }}
        />,
      );

      const passwordInput = renderer.root.findByProps({
        testID: "signin-password-input",
      });

      await act(async () => {
        await passwordInput.props.onSubmitEditing?.();
      });

      expect(onSubmit).toHaveBeenCalledWith({
        email: "clinician@example.com",
        password: "password123",
      });
    });

    it("hides the password by default and lets the user reveal it", async () => {
      const renderer = await render(
        <SignInScreen onSubmit={vi.fn()} onForgotPassword={vi.fn()} />
      );

      const passwordInput = renderer.root.findByProps({
        testID: "signin-password-input",
      });
      const toggleButton = renderer.root.findByProps({
        testID: "signin-toggle-password-visibility",
      });

      expect(passwordInput.props.secureTextEntry).toBe(true);
      expect(passwordInput.props.autoCapitalize).toBe("none");

      await act(async () => {
        toggleButton.props.onPress();
      });

      const revealedPasswordInput = renderer.root.findByProps({
        testID: "signin-password-input",
      });
      expect(revealedPasswordInput.props.secureTextEntry).toBe(false);
    });

    it("shows a clear sign-in recovery message instead of routing into email verification", async () => {
      const onSubmit = vi.fn().mockRejectedValue({
        status: 403,
        details: {
          otpRequired: true,
          email: "clinician@example.com",
        },
      });

      const renderer = await render(
        <SignInScreen
          onSubmit={onSubmit}
          onForgotPassword={vi.fn()}
          defaultValues={{
            email: "clinician@example.com",
            password: "password123",
          }}
        />,
      );

      const submitButton = renderer.root.findByProps({
        testID: "signin-submit-button",
      });

      await act(async () => {
        await submitButton.props.onPress();
      });

      const text = collectText(renderer.toJSON());
      expect(text).toContain("We could not sign you in. Check your email and password, then try again.");
      expect(text).not.toContain("Something went wrong. Please try again.");
    });

    it("preserves the safe invalid-credentials message from the backend", async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error("Invalid credentials"));

      const renderer = await render(
        <SignInScreen
          onSubmit={onSubmit}
          onForgotPassword={vi.fn()}
          defaultValues={{
            email: "clinician@example.com",
            password: "password123",
          }}
        />,
      );

      await act(async () => {
        await renderer.root.findByProps({ testID: "signin-submit-button" }).props.onPress();
      });

      const text = collectText(renderer.toJSON());
      expect(text).toContain("Invalid credentials");
      expect(text).not.toContain("Something went wrong. Please try again.");
    });

    it("keeps the password masked and disables the eye toggle while submit is pending", async () => {
      let resolveSubmit: (() => void) | undefined;
      const onSubmit = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          }),
      );

      const renderer = await render(
        <SignInScreen
          onSubmit={onSubmit}
          onForgotPassword={vi.fn()}
          defaultValues={{
            email: "clinician@example.com",
            password: "password123",
          }}
        />,
      );

      const submitButton = renderer.root.findByProps({
        testID: "signin-submit-button",
      });

      await act(async () => {
        submitButton.props.onPress();
        await Promise.resolve();
      });

      const passwordInput = renderer.root.findByProps({
        testID: "signin-password-input",
      });
      const toggleButton = renderer.root.findByProps({
        testID: "signin-toggle-password-visibility",
      });

      expect(passwordInput.props.secureTextEntry).toBe(true);
      expect(toggleButton.props.disabled).toBe(true);

      await act(async () => {
        resolveSubmit?.();
        await Promise.resolve();
      });
    });
  });

  describe("SignUpScreen", () => {
    it("renders signup form with correct fields", async () => {
      const renderer = await render(
        <SignUpScreen onOtpRequired={vi.fn()} onBackToSignIn={vi.fn()} />
      );
      const text = collectText(renderer.toJSON());
      expect(text).toContain("Create Account");
      expect(text).toContain("Set up your Physio Note Finisher clinician account.");
      expect(text).not.toContain("SwiftSOAP");
      expect(text).toContain("First Name");
      expect(text).toContain("Last Name");
      expect(text).toContain("Email");
      expect(text).toContain("Password");
      expect(text).toContain("I acknowledge that I will use this app for authorized clinical documentation.");
      expect(
        renderer.root.findByProps({
          testID: "signup-data-handling-acknowledgement-checkbox",
        }),
      ).toBeTruthy();
    });

    it("shows email validation only after typing and keeps create account disabled until the form is valid", async () => {
      const renderer = await render(
        <SignUpScreen onOtpRequired={vi.fn()} onBackToSignIn={vi.fn()} />
      );

      const firstNameInput = findInputByPlaceholder(renderer, "Ada");
      const lastNameInput = findInputByPlaceholder(renderer, "Lovelace");
      const emailInput = findInputByPlaceholder(renderer, "name@clinic.com");
      const passwordInput = renderer.root.findByProps({
        testID: "signup-password-input",
      });
      const toggleButton = renderer.root.findByProps({
        testID: "signup-toggle-password-visibility",
      });
      const submitButton = renderer.root.findByProps({
        testID: "signup-submit-button",
      });
      expect(passwordInput.props.secureTextEntry).toBe(true);
      expect(passwordInput.props.autoCapitalize).toBe("none");
      expect(submitButton.props.disabled).toBe(true);
      expect(collectText(renderer.toJSON())).not.toContain("Enter a valid email address");

      await act(async () => {
        toggleButton.props.onPress();
      });

      const revealedPasswordInput = renderer.root.findByProps({
        testID: "signup-password-input",
      });
      expect(revealedPasswordInput.props.secureTextEntry).toBe(false);

      await act(async () => {
        emailInput.props.onChangeText("invalid-email");
      });

      expect(collectText(renderer.toJSON())).toContain("Enter a valid email address");
      expect(
        renderer.root.findByProps({ testID: "signup-submit-button" }).props.disabled,
      ).toBe(true);

      await act(async () => {
        firstNameInput.props.onChangeText("Ada");
        lastNameInput.props.onChangeText("Lovelace");
        emailInput.props.onChangeText("ada@example.com");
        revealedPasswordInput.props.onChangeText("password123");
      });

      expect(
        renderer.root.findByProps({ testID: "signup-submit-button" }).props.disabled,
      ).toBe(true);

      await act(async () => {
        renderer.root
          .findByProps({ testID: "signup-data-handling-acknowledgement-checkbox" })
          .props.onPress();
      });

      const enabledSubmitButton = renderer.root.findByProps({
        testID: "signup-submit-button",
      });
      expect(enabledSubmitButton.props.disabled).toBe(false);
    });

    it("shows a generic signup error banner for unexpected failures", async () => {
      authHookState.signup.mutateAsync.mockRejectedValueOnce(new Error("SMTP outage"));

      const renderer = await render(
        <SignUpScreen onOtpRequired={vi.fn()} onBackToSignIn={vi.fn()} />
      );

      const firstNameInput = findInputByPlaceholder(renderer, "Ada");
      const lastNameInput = findInputByPlaceholder(renderer, "Lovelace");
      const emailInput = findInputByPlaceholder(renderer, "name@clinic.com");
      const passwordInput = renderer.root.findByProps({
        testID: "signup-password-input",
      });

      await act(async () => {
        firstNameInput.props.onChangeText("Ada");
        lastNameInput.props.onChangeText("Lovelace");
        emailInput.props.onChangeText("ada@example.com");
        passwordInput.props.onChangeText("password123");
        renderer.root
          .findByProps({ testID: "signup-data-handling-acknowledgement-checkbox" })
          .props.onPress();
      });

      await act(async () => {
        await renderer.root.findByProps({ testID: "signup-submit-button" }).props.onPress();
      });

      const text = collectText(renderer.toJSON());
      expect(text).toContain("Something went wrong. Please try again.");
      expect(text).not.toContain("SMTP outage");
    });

    it("submits the fixed acknowledgement version only after acknowledgement is checked", async () => {
      const onOtpRequired = vi.fn();
      const renderer = await render(
        <SignUpScreen onOtpRequired={onOtpRequired} onBackToSignIn={vi.fn()} />,
      );
      const firstNameInput = findInputByPlaceholder(renderer, "Ada");
      const lastNameInput = findInputByPlaceholder(renderer, "Lovelace");
      const emailInput = findInputByPlaceholder(renderer, "name@clinic.com");
      const passwordInput = renderer.root.findByProps({ testID: "signup-password-input" });

      await act(async () => {
        firstNameInput.props.onChangeText("Ada");
        lastNameInput.props.onChangeText("Lovelace");
        emailInput.props.onChangeText("ada@example.com");
        passwordInput.props.onChangeText("password123");
        renderer.root
          .findByProps({ testID: "signup-data-handling-acknowledgement-checkbox" })
          .props.onPress();
      });
      await act(async () => {
        await renderer.root.findByProps({ testID: "signup-submit-button" }).props.onPress();
      });

      expect(authHookState.signup.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          acknowledgementVersion: "2026-07-17",
        }),
      );
      expect(onOtpRequired).toHaveBeenCalledWith("clinician@example.com");
    });

    it("preserves the safe duplicate-email message from signup", async () => {
      authHookState.signup.mutateAsync.mockRejectedValueOnce(new Error("Email already registered"));

      const renderer = await render(
        <SignUpScreen onOtpRequired={vi.fn()} onBackToSignIn={vi.fn()} />
      );

      const firstNameInput = findInputByPlaceholder(renderer, "Ada");
      const lastNameInput = findInputByPlaceholder(renderer, "Lovelace");
      const emailInput = findInputByPlaceholder(renderer, "name@clinic.com");
      const passwordInput = renderer.root.findByProps({
        testID: "signup-password-input",
      });

      await act(async () => {
        firstNameInput.props.onChangeText("Ada");
        lastNameInput.props.onChangeText("Lovelace");
        emailInput.props.onChangeText("ada@example.com");
        passwordInput.props.onChangeText("password123");
        renderer.root
          .findByProps({ testID: "signup-data-handling-acknowledgement-checkbox" })
          .props.onPress();
      });

      await act(async () => {
        await renderer.root.findByProps({ testID: "signup-submit-button" }).props.onPress();
      });

      const text = collectText(renderer.toJSON());
      expect(text).toContain("Email already registered");
      expect(text).not.toContain("Something went wrong. Please try again.");
    });

    it("has a back to sign in button", async () => {
      const onBack = vi.fn();
      const renderer = await render(
        <SignUpScreen onOtpRequired={vi.fn()} onBackToSignIn={onBack} />
      );
      const backBtn = renderer.root.findByProps({ testID: "signup-back-button" });
      expect(backBtn).toBeTruthy();
      
      act(() => {
        backBtn?.props.onPress();
      });
      expect(onBack).toHaveBeenCalled();
    });
  });

  describe("VerifyEmailOtpScreen", () => {
    it("renders otp screen with email address", async () => {
      const email = "clinician@example.com";
      const renderer = await render(
        <VerifyEmailOtpScreen email={email} onVerified={vi.fn()} onBackToSignup={vi.fn()} />
      );
      const text = collectText(renderer.toJSON());
      expect(text).toContain("Check your email");
      expect(text).toContain(email);
    });

    it("renders code input placeholder", async () => {
      const renderer = await render(
        <VerifyEmailOtpScreen
          email="clinician@example.com"
          onVerified={vi.fn()}
          onBackToSignup={vi.fn()}
        />
      );
      const inputs = renderer.root.findAllByProps({ placeholder: "000000" });
      expect(inputs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
