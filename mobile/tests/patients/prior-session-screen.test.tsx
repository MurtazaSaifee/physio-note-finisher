import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

const hookState = vi.hoisted(() => ({
  priorSession: {
    data: {
      id: "session-1",
      patientId: "patient-1",
      sessionDate: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "finalized",
      finalNote: "Full note",
      patientSummary: "Summary",
      priorPlan: null,
      carryForwardContext: null,
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:40:00.000Z",
    },
    isLoading: false,
    refetch: vi.fn(),
  },
  copyForward: {
    isPending: false,
    copyForward: vi.fn(async () => ({
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: [],
      priorPlan: null,
      carryForwardContext: null,
      sourceSessionDate: "2026-04-17T12:34:56.000Z",
    })),
  },
}));

const priorSessionMode = vi.hoisted(() => ({
  current: "available" as "available" | "loading" | "unavailable" | "error",
}));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  usePriorSession: vi.fn(() =>
    priorSessionMode.current === "available"
      ? hookState.priorSession
      : {
          data: undefined,
          isLoading: priorSessionMode.current === "loading",
          isError: priorSessionMode.current === "error",
          refetch: hookState.priorSession.refetch,
        },
  ),
}));

vi.mock("../../features/patients/hooks/useCopyForward.js", () => ({
  useCopyForward: vi.fn(() => hookState.copyForward),
}));

import { PriorSessionScreen } from "../../features/patients/screens/PriorSessionScreen";

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

  return (node.children ?? [])
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

afterEach(() => {
  priorSessionMode.current = "available";
  vi.clearAllMocks();
});

describe("PriorSessionScreen", () => {
  it("keeps loading content distinct from genuinely unavailable content", async () => {
    priorSessionMode.current = "loading";

    const renderer = await render(
      <PriorSessionScreen patientId="patient-1" sessionId="session-1" />,
    );

    const text = collectText(renderer.toJSON());
    expect(
      renderer.root.findByProps({ testID: "prior-session-loading-state" }),
    ).toBeTruthy();
    const copyForwardButton = renderer.root.findByProps({
      testID: "prior-session-copy-forward-button",
    });

    expect(text).toContain("Loading prior session...");
    expect(text).toContain("Prior session content is still loading.");
    expect(text).not.toContain("unavailable");
    expect(text).not.toContain("No sections available to copy.");
    expect(copyForwardButton.props.disabled).toBe(true);
  });

  it("shows a retryable error without copy-forward controls when loading fails", async () => {
    priorSessionMode.current = "error";

    const renderer = await render(
      <PriorSessionScreen patientId="patient-1" sessionId="session-1" />,
    );

    const text = collectText(renderer.toJSON());

    expect(
      renderer.root.findByProps({ testID: "prior-session-error-state" }),
    ).toBeTruthy();
    expect(text).toContain("Could not load prior session");
    expect(text).toContain("Check your connection and try again.");
    expect(text).toContain("Try again");
    expect(text).not.toContain("Prior session unavailable.");
    expect(text).not.toContain("Copy forward");
    expect(
      renderer.root.findAllByProps({ testID: "prior-session-copy-forward-button" }),
    ).toHaveLength(0);

    const retryButton = renderer.root.findByProps({
      testID: "prior-session-retry-button",
    });
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton.props.onPress();
      await Promise.resolve();
    });

    expect(hookState.priorSession.refetch).toHaveBeenCalledOnce();
  });

  it("reports missing prior-session data as unavailable after loading ends", async () => {
    priorSessionMode.current = "unavailable";

    const renderer = await render(
      <PriorSessionScreen patientId="patient-1" sessionId="session-1" />,
    );

    const text = collectText(renderer.toJSON());

    expect(text).toContain("Prior session unavailable.");
    expect(text).toContain("No sections available to copy.");
    expect(text).not.toContain("still loading");
  });

  it("does not preselect or enable copy-forward for unavailable content", async () => {
    const renderer = await render(
      <PriorSessionScreen patientId="patient-1" sessionId="session-1" />,
    );

    const text = collectText(renderer.toJSON());
    const priorPlanChip = renderer.root.findByProps({
      testID: "prior-session-prior-plan-chip",
    });
    const copyForwardButton = renderer.root.findByProps({
      testID: "prior-session-copy-forward-button",
    });

    expect(text).toContain("Not available");
    expect(text).toContain("Apr 17, 2026");
    expect(text).not.toContain("2026-04-17");
    expect(text).toContain("No sections available to copy.");
    expect(priorPlanChip.props.accessibilityState).toMatchObject({
      disabled: true,
      selected: false,
    });
    expect(copyForwardButton.props.disabled).toBe(true);
  });

  it("formats timeline dates consistently with prior-session dates", async () => {
    const { TimelineCard } = await import(
      "../../features/patients/components/TimelineCard"
    );
    const renderer = await render(
      <TimelineCard
        item={{
          id: "session-2",
          patientId: "patient-1",
          sessionDate: "2026-04-18T12:34:56.000Z",
          visitType: "follow-up",
          noteStatus: "finalized",
          finalNotePreview: "Final note",
          patientSummaryPreview: "Summary",
        }}
        onOpenSession={() => undefined}
      />,
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Apr 18, 2026");
    expect(text).not.toContain("2026-04-18");
  });
});
