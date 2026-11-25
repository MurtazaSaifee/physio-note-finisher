import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordScreen } from "../../app/(auth)/forgot-password";

const forgotPasswordHookState = vi.hoisted(() => ({
  initiate: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  reset: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
}));

// Mock react-native
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    absoluteFillObject: {},
  },
}));

vi.mock("lucide-react-native", () => ({
  Eye: "Eye",
  EyeOff: "EyeOff",
}));

// Mock the hook
vi.mock("../../features/auth/api/useForgotPassword", () => ({
  useForgotPassword: () => ({
    initiate: forgotPasswordHookState.initiate,
    reset: forgotPasswordHookState.reset,
  }),
}));

function collectText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (node.children) return collectText(node.children);
  if (node.props && node.props.children) return collectText(node.props.children);
  return "";
}

beforeEach(() => {
  vi.clearAllMocks();
  forgotPasswordHookState.initiate.isPending = false;
  forgotPasswordHookState.reset.isPending = false;
  forgotPasswordHookState.initiate.mutateAsync.mockReset().mockResolvedValue({
    sent: true,
    remainingResends: 3,
    retryAfterSeconds: 60,
  });
  forgotPasswordHookState.reset.mutateAsync.mockReset().mockResolvedValue({ updated: true });
});

describe("ForgotPasswordScreen", () => {
  it("keeps reset content-height sized for the shared auth ScrollView", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={vi.fn()} />);
    });
    const container = renderer.root.findByType("KeyboardAvoidingView");

    expect(container.props.style).toMatchObject({ width: "100%" });
    expect(container.props.style).not.toHaveProperty("flex", 1);
  });

  it("renders initiate step initially", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={vi.fn()} />);
    });
    const text = collectText(renderer.toJSON());
    expect(text).toContain("Reset Password");
    expect(text).toContain("Enter your email to receive a verification code.");
    expect(text).toContain("Enter your email address to enable Send Reset Code.");
    expect(renderer.root.findAllByProps({ placeholder: "name@clinic.com" }).length).toBeGreaterThanOrEqual(1);
  });

  it("shows invalid email guidance and keeps send disabled until the email is valid", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={vi.fn()} />);
    });

    const emailInput = renderer.root.findByProps({ testID: "forgotpassword-email-input" });
    const sendButton = renderer.root.findByProps({ testID: "forgotpassword-send-button" });

    expect(sendButton.props.disabled).toBe(true);
    expect(collectText(renderer.toJSON())).not.toContain("Enter a valid email address");

    await act(async () => {
      emailInput.props.onChangeText("not-an-email");
    });

    expect(collectText(renderer.toJSON())).toContain("Enter a valid email address");
    expect(collectText(renderer.toJSON())).not.toContain(
      "Enter your email address to enable Send Reset Code.",
    );
    expect(renderer.root.findByProps({ testID: "forgotpassword-send-button" }).props.disabled).toBe(true);

    await act(async () => {
      emailInput.props.onChangeText("test@example.com");
    });

    expect(renderer.root.findByProps({ testID: "forgotpassword-send-button" }).props.disabled).toBe(false);
    expect(collectText(renderer.toJSON())).not.toContain(
      "Enter your email address to enable Send Reset Code.",
    );
  });

  it("switches to reset step after initiation", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={vi.fn()} />);
    });
    
    // Fill email
    const emailInput = renderer.root.findByProps({ placeholder: "name@clinic.com" });
    await act(async () => {
      emailInput.props.onChangeText("test@example.com");
    });

    // Click send
    const buttons = renderer.root.findAllByProps({ accessibilityRole: "button" });
    const sendBtn = buttons.find((b: any) => collectText(b).includes("Send Reset Code"));
    
    await act(async () => {
      sendBtn?.props.onPress();
    });

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Enter the code sent to your email");
    expect(renderer.root.findAllByProps({ placeholder: "000000" }).length).toBeGreaterThanOrEqual(1);
    expect(collectText(renderer.toJSON())).toContain("resends remaining");
  });

  it("shows a generic error banner when reset-code delivery fails unexpectedly", async () => {
    forgotPasswordHookState.initiate.mutateAsync.mockRejectedValueOnce(new Error("SES timeout"));

    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={vi.fn()} />);
    });

    const emailInput = renderer.root.findByProps({ testID: "forgotpassword-email-input" });
    await act(async () => {
      emailInput.props.onChangeText("test@example.com");
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: "forgotpassword-send-button" }).props.onPress();
    });

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Something went wrong. Please try again.");
    expect(text).not.toContain("SES timeout");
  });

  it("preserves the safe invalid-verification-code message during password reset", async () => {
    forgotPasswordHookState.reset.mutateAsync.mockRejectedValueOnce(
      new Error("Invalid verification code"),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "forgotpassword-email-input" }).props.onChangeText("test@example.com");
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: "forgotpassword-send-button" }).props.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "forgotpassword-code-input" }).props.onChangeText("123456");
      renderer.root.findByProps({ testID: "forgotpassword-newpassword-input" }).props.onChangeText("password123");
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: "forgotpassword-reset-button" }).props.onPress();
    });

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Invalid verification code");
    expect(text).not.toContain("Something went wrong. Please try again.");
  });

  it("keeps the new password hidden by default and lets the user reveal it", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={vi.fn()} />);
    });

    const emailInput = renderer.root.findByProps({ placeholder: "name@clinic.com" });
    await act(async () => {
      emailInput.props.onChangeText("test@example.com");
    });

    const buttons = renderer.root.findAllByProps({ accessibilityRole: "button" });
    const sendBtn = buttons.find((b: any) => collectText(b).includes("Send Reset Code"));
    await act(async () => {
      sendBtn?.props.onPress();
    });

    const passwordInput = renderer.root.findByProps({
      testID: "forgotpassword-newpassword-input",
    });
    const toggleButton = renderer.root.findByProps({
      testID: "forgotpassword-toggle-password-visibility",
    });

    expect(passwordInput.props.secureTextEntry).toBe(true);
    expect(passwordInput.props.autoCapitalize).toBe("none");

    await act(async () => {
      toggleButton.props.onPress();
    });

    const revealedPasswordInput = renderer.root.findByProps({
      testID: "forgotpassword-newpassword-input",
    });
    expect(revealedPasswordInput.props.secureTextEntry).toBe(false);
  });

  it("keeps inline reset validation specific for a 6-digit code", async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={vi.fn()} />);
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "forgotpassword-email-input" }).props.onChangeText("test@example.com");
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: "forgotpassword-send-button" }).props.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "forgotpassword-code-input" }).props.onChangeText("123");
      renderer.root.findByProps({ testID: "forgotpassword-newpassword-input" }).props.onChangeText("password123");
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: "forgotpassword-reset-button" }).props.onPress();
    });

    expect(collectText(renderer.toJSON())).toContain("Enter the 6-digit code");
  });

  it("calls onBack when back button is pressed", async () => {
    const onBack = vi.fn();
    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen onSuccess={vi.fn()} onBack={onBack} />);
    });
    const buttons = renderer.root.findAllByProps({ accessibilityRole: "button" });
    const backBtn = buttons.find((b: any) => collectText(b).includes("Back to Sign In"));
    
    await act(async () => {
      backBtn?.props.onPress();
    });
    expect(onBack).toHaveBeenCalled();
  });
});
