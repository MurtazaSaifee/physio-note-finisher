import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("lucide-react-native", () => ({
  ChevronLeft: "ChevronLeft",
  Eye: "Eye",
  EyeOff: "EyeOff",
}));

vi.mock("../../features/auth/providers/AuthProvider", () => ({
  useAuth: () => ({
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../features/auth/api/useVerifyOtp", () => ({
  useSendOtp: () => ({
    mutateAsync: vi.fn().mockResolvedValue({
      sent: true,
      remainingResends: 3,
      retryAfterSeconds: 60,
    }),
    isPending: false,
  }),
}));

vi.mock("../../features/settings/api/useGetProfile", () => ({
  useGetProfile: () => ({
    data: {
      email: "clinician@example.com",
    },
    isLoading: false,
  }),
}));

vi.mock("../../features/settings/api/useResetPassword", () => ({
  useResetPassword: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}));

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  if (!renderer) {
    throw new Error("Failed to render");
  }
  return renderer;
}

afterEach(() => {
  vi.clearAllMocks();
});

import { PasswordChangeScreen } from "../../app/(app)/settings/password";

describe("PasswordChangeScreen", () => {
  it("uses verification-code language instead of an unexplained OTP acronym", async () => {
    const renderer = await render(<PasswordChangeScreen onBack={vi.fn()} />);
    const text = JSON.stringify(renderer.toJSON());

    expect(text).toContain("Send a verification code to your email, then set a new password.");
    expect(text).not.toContain("Send an email OTP");
  });

  it("keeps password fields hidden by default and lets the user reveal them", async () => {
    const renderer = await render(<PasswordChangeScreen onBack={vi.fn()} />);

    const newPasswordInput = renderer.root.findByProps({
      testID: "password-newpassword-input",
    });
    const confirmPasswordInput = renderer.root.findByProps({
      testID: "password-confirmpassword-input",
    });

    expect(newPasswordInput.props.secureTextEntry).toBe(true);
    expect(newPasswordInput.props.autoCapitalize).toBe("none");
    expect(confirmPasswordInput.props.secureTextEntry).toBe(true);
    expect(confirmPasswordInput.props.autoCapitalize).toBe("none");

    const revealNewPassword = renderer.root.findByProps({
      testID: "password-toggle-newpassword-visibility",
    });
    const revealConfirmPassword = renderer.root.findByProps({
      testID: "password-toggle-confirmpassword-visibility",
    });

    await act(async () => {
      revealNewPassword.props.onPress();
      revealConfirmPassword.props.onPress();
    });

    expect(
      renderer.root.findByProps({ testID: "password-newpassword-input" }).props
        .secureTextEntry,
    ).toBe(false);
    expect(
      renderer.root.findByProps({ testID: "password-confirmpassword-input" }).props
        .secureTextEntry,
    ).toBe(false);
  });

  it("shows resend limits after the first code send", async () => {
    const renderer = await render(<PasswordChangeScreen onBack={vi.fn()} />);

    const sendButton = renderer.root.findByProps({
      testID: "password-send-code-button",
    });

    await act(async () => {
      await sendButton.props.onPress();
    });

    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain("Verification code sent to your email.");
    expect(text).toContain("resends remaining");
  });
});
