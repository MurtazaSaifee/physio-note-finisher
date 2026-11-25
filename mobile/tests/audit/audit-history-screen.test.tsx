import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

vi.mock("../../features/ui/meridian/tokens", () => ({
  meridian: {
    color: {
      primary: "#007A8A",
      surface: "#FFFFFF",
      text: "#0F172A",
      textSubtle: "#64748B",
      surfaceMuted: "#F1F5F9",
      primarySoft: "#E0F2F1",
      destructive: "#B91C1C",
      border: "#E2E8F0",
      warning: "#D97706",
    },
    spacing: { sm: 8, md: 16, lg: 24, xs: 4 },
    radius: { card: 16, chip: 12 },
    shadow: { card: {} },
  },
}));

vi.mock("../../features/ui/meridian/typography", () => ({
  typography: {
    body: { fontSize: 14, lineHeight: 20 },
    label: { fontSize: 12, fontWeight: "600" },
    heading: { fontSize: 18, fontWeight: "600" },
  },
}));

vi.mock("../../features/ui/meridian/primitives", () => ({
  MeridianCard: (props: { children: React.ReactNode }) =>
    React.createElement("View", null, props.children),
}));

vi.mock("lucide-react-native", () => ({
  ChevronLeft: () => React.createElement("Text", null, "<"),
}));

const mockAuditState = vi.hoisted(() => ({
  events: [] as Array<{
    id: string;
    eventType: string;
    sessionId: string;
    userId: string;
    timestamp: string;
    metadata: Record<string, unknown> | null;
    user: { firstName: string; lastName: string } | null;
  }>,
  isLoading: false,
  error: null as Error | null,
}));

vi.mock("../../features/audit/hooks/useAuditHistory.js", () => ({
  useAuditHistory: vi.fn(() => ({
    data: mockAuditState.events.length > 0 || !mockAuditState.isLoading
      ? { sessionId: "session-1", events: mockAuditState.events }
      : null,
    isLoading: mockAuditState.isLoading,
    error: mockAuditState.error,
  })),
}));

import { AuditHistoryScreen } from "../../features/audit/screens/AuditHistoryScreen";

function collectText(node: TestRenderer.ReactTestRendererJSON | null): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  const children = node.children ?? [];
  return children.map((child) => (typeof child === "string" ? child : collectText(child))).join(" ");
}

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Failed to render");
  return renderer;
}

describe("AuditHistoryScreen", () => {
  beforeEach(() => {
    mockAuditState.events = [];
    mockAuditState.isLoading = false;
    mockAuditState.error = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders event type labels, timestamps, and clinician names in order", async () => {
    mockAuditState.events = [
      {
        id: "audit-1",
        eventType: "noteCreated",
        sessionId: "session-1",
        userId: "user-1",
        timestamp: "2026-04-30T09:00:00.000Z",
        metadata: null,
        user: { firstName: "Alice", lastName: "Smith" },
      },
      {
        id: "audit-2",
        eventType: "sectionEdited",
        sessionId: "session-1",
        userId: "user-1",
        timestamp: "2026-04-30T10:00:00.000Z",
        metadata: { sectionName: "objective" },
        user: { firstName: "Alice", lastName: "Smith" },
      },
      {
        id: "audit-3",
        eventType: "noteFinalized",
        sessionId: "session-1",
        userId: "user-1",
        timestamp: "2026-04-30T11:00:00.000Z",
        metadata: null,
        user: { firstName: "Alice", lastName: "Smith" },
      },
    ];

    const renderer = await render(
      React.createElement(AuditHistoryScreen, { sessionId: "session-1" }),
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Note created");
    expect(text).toContain("Section edited");
    expect(text).toContain("Note finalized");
    expect(text).toContain("Alice Smith");
    expect(text).toContain("4/30/2026");
  });

  it("shows empty state when no events exist", async () => {
    mockAuditState.events = [];

    const renderer = await render(
      React.createElement(AuditHistoryScreen, { sessionId: "session-1" }),
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("No history for this note");
  });

  it("shows loading indicator while fetching", async () => {
    mockAuditState.isLoading = true;
    mockAuditState.events = [];

    const renderer = await render(
      React.createElement(AuditHistoryScreen, { sessionId: "session-1" }),
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Loading history");
  });

  it("calls onBack when back button is pressed", async () => {
    mockAuditState.events = [
      {
        id: "audit-1",
        eventType: "noteCreated",
        sessionId: "session-1",
        userId: "user-1",
        timestamp: "2026-04-30T09:00:00.000Z",
        metadata: null,
        user: { firstName: "Alice", lastName: "Smith" },
      },
    ];

    const onBack = vi.fn();
    const renderer = await render(
      React.createElement(AuditHistoryScreen, { sessionId: "session-1", onBack }),
    );

    const backButton = renderer.root.findByProps({
      testID: "audit-back-button",
    });

    expect(backButton).toBeTruthy();

    await act(async () => {
      backButton?.props.onPress();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
