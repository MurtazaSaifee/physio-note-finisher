import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

vi.mock("lucide-react-native", () => ({
  ChevronLeft: "ChevronLeft",
}));

import { MeridianScreenHeader } from "../../features/ui/meridian/ScreenHeader";
import { MeridianBackButton } from "../../features/ui/meridian/BackButton";

describe("MeridianScreenHeader", () => {
  it("stretches across horizontal wrappers so task copy cannot collapse", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <MeridianScreenHeader
          title="Manual SOAP note"
          subtitle="Review, edit, and finalize the note before sharing."
          onBack={() => undefined}
          variant="task"
        />,
      );
    });

    const rootView = renderer?.root.findAllByType("View")[0];
    const flattenedStyle = Object.assign({}, ...(rootView?.props.style ?? []));

    expect(flattenedStyle).toMatchObject({
      alignSelf: "stretch",
      width: "100%",
    });
  });

  it("extends the compact back button hit area to 48 points", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(<MeridianBackButton onPress={() => undefined} />);
    });

    const pressable = renderer?.root.findByType("Pressable");
    expect(pressable?.props.hitSlop).toBe(4);
  });
});
