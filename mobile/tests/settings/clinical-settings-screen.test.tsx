import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  Linking: { openURL: vi.fn().mockResolvedValue(undefined) },
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

const profileHookState = vi.hoisted(() => ({
  data: {
    id: "user-1",
    clinicId: "clinic-1",
    firstName: "Mira",
    lastName: "Shah",
    email: "mira@clinic.com",
    emailVerified: true,
    tokenVersion: 1,
    audioRetentionPeriod: "30d",
  },
  isLoading: false,
}));

const notificationPrefsHookState = vi.hoisted(() => ({
  data: {
    defaultReminderTiming: "1h",
    pushEnabled: true,
  },
  isLoading: false,
}));

const googleStatusHookState = vi.hoisted(() => ({
  data: {
    connected: true,
    accountEmail: "mira@example.com",
    lastSyncedAt: "2026-04-30T06:00:00.000Z",
    syncState: "connected" as const,
  },
  isLoading: false,
}));

vi.mock("../../features/auth/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    status: "authenticated" as const,
    runProtectedAction: vi.fn((fn: (token: string) => Promise<unknown>) => fn("test-token")),
  })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../features/settings/api/useGetProfile.js", () => ({
  useGetProfile: vi.fn(() => profileHookState),
}));

vi.mock("../../features/settings/api/useNotificationPreferences.js", () => ({
  useNotificationPreferences: vi.fn(() => notificationPrefsHookState),
  useUpdateNotificationPreferences: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ defaultReminderTiming: "2h", pushEnabled: true }),
    isPending: false,
  })),
}));

vi.mock("../../features/settings/api/useGoogleCalendarStatus.js", () => ({
  useGoogleCalendarStatus: vi.fn(() => googleStatusHookState),
  useGoogleCalendarConnectUrl: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth"),
    isPending: false,
  })),
  useDisconnectGoogleCalendar: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  })),
}));

const meridianButtonCalls: Array<{
  label: string;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}> = [];

vi.mock("../../features/ui/meridian/primitives.js", () => ({
  MeridianButton: vi.fn(({
    label,
    disabled,
    onPress,
    testID,
  }: {
    label: string;
    disabled?: boolean;
    onPress?: () => void;
    testID?: string;
  }) => {
    meridianButtonCalls.push({ label, disabled, onPress, testID });
    return React.createElement(
      "Pressable",
      { disabled, onPress, accessibilityLabel: label, testID },
      label,
    );
  }),
  MeridianCard: vi.fn(({ children }: { children: React.ReactNode }) => React.createElement("View", null, children)),
  MeridianInput: vi.fn(({ value, accessibilityLabel }: { value?: string; accessibilityLabel?: string }) =>
    React.createElement("View", { accessibilityLabel }, value),
  ),
}));

import { ClinicalSettingsScreen } from "../../app/(app)/settings/index";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function collectText(
  node:
    | TestRenderer.ReactTestRendererJSON
    | TestRenderer.ReactTestRendererJSON[]
    | null,
): string {
  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map(collectText).join(" ");
  }

  const children = node.children ?? [];

  return children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

afterEach(() => {
  vi.clearAllMocks();
  meridianButtonCalls.length = 0;
});

describe("clinical settings screen", () => {
  it("hides unfinished reminder, calendar, and policy controls", async () => {
    const queryClient = createQueryClient();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <ClinicalSettingsScreen onOpenPasswordChange={() => undefined} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).not.toContain("Reminder timing");
    expect(text).not.toContain("Google Calendar");
    expect(text).not.toContain("Terms & Conditions");
    expect(text).not.toContain("Privacy Policy");
  });

  it("keeps audio retention controls rendered with persistent dock clearance", async () => {
    const queryClient = createQueryClient();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <ClinicalSettingsScreen onOpenPasswordChange={() => undefined} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    if (!renderer) {
      throw new Error("Failed to render");
    }

    const contentStyle = Object.assign(
      {},
      ...(renderer.root.findByType("ScrollView").props.contentContainerStyle as Record<string, unknown>[]),
    );
    expect(contentStyle).toMatchObject({
      paddingBottom: 32,
    });

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Audio Retention");
    expect(text).toContain("7 days");
    expect(text).toContain("30 days");
    expect(text).toContain("90 days");
    expect(text).toContain("Keep forever");
    expect(renderer.root.findByProps({ testID: "settings-retention-30d" })).toBeTruthy();
  });

  it("uses canonical Settings branding and exposes the selected retention choice", async () => {
    const queryClient = createQueryClient();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <ClinicalSettingsScreen onOpenPasswordChange={() => undefined} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Physio Note Finisher");
    expect(text).not.toContain("SwiftSOAP");
    expect(
      renderer?.root.findByProps({ testID: "settings-retention-30d" }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      renderer?.root.findByProps({ testID: "settings-retention-7d" }).props.accessibilityState,
    ).toEqual({ selected: false });
  });

  it("does not render misleading inline password inputs on settings", async () => {
    const queryClient = createQueryClient();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <ClinicalSettingsScreen onOpenPasswordChange={() => undefined} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);

    expect(text).toContain("Send a verification code to your email");
    expect(renderer?.root.findAllByProps({ testID: "settings-current-password-input" })).toHaveLength(0);
    expect(renderer?.root.findAllByProps({ testID: "settings-new-password-input" })).toHaveLength(0);
    expect(
      renderer?.root.findAllByProps({ testID: "settings-change-password-button" }).length,
    ).toBeGreaterThan(0);
  });
});
