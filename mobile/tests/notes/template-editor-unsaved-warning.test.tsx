import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

import { TemplateEditorScreen } from "../../features/notes/screens/TemplateEditorScreen";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<typeof import("react-native")>("react-native");
  return {
    ...actual,
    Modal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("@react-navigation/native", () => ({
  usePreventRemove: vi.fn((_prevent, _callback) => {
    // We don't need to actually block, just recording it exists.
    // The screen tests manually calling onBack without react-navigation context,
    // so the back button handler triggers setShowDiscard(true) in the component.
  }),
}));

vi.mock("../../features/notes/hooks/useNotes", () => ({
  useTemplateCategories: () => ({ data: [], isLoading: false }),
  useCreateCustomTemplate: () => ({ isPending: false, createCustomTemplate: vi.fn(async () => undefined) }),
  useUpdateCustomTemplate: () => ({ isPending: false, updateCustomTemplate: vi.fn(async () => undefined) }),
}));

describe("TemplateEditorScreen unsaved warning", () => {
  it("shows discard confirmation on back when there are unsaved changes", async () => {
    const onBack = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<TemplateEditorScreen onBack={onBack} />);
    });

    const nameInput = renderer!.root.findByProps({ testID: "template-editor-name-input" });
    await act(async () => {
      nameInput.props.onChangeText("Knee Boost");
    });

    const backButton = renderer!.root.findByProps({ testID: "template-editor-back-button" });
    await act(async () => {
      backButton.props.onPress();
    });

    expect(() => renderer!.root.findByProps({ testID: "template-editor-discard-button" })).not.toThrow();
    expect(onBack).not.toHaveBeenCalled();
  });
});
