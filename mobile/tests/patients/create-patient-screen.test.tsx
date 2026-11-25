import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createPatient = vi.hoisted(() => vi.fn());
const announceForAccessibility = vi.hoisted(() => vi.fn());

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  ScrollView: "ScrollView",
  Pressable: "Pressable",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  AccessibilityInfo: { announceForAccessibility },
  Platform: { OS: "android" },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock("lucide-react-native", () => ({ ChevronLeft: "ChevronLeft" }));

vi.mock("../../features/patients/hooks/usePatients.js", () => ({
  useCreatePatient: vi.fn(() => ({ isPending: false, mutateAsync: createPatient })),
}));

import { CreatePatientScreen } from "../../features/patients/screens/CreatePatientScreen";

function collectText(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  return (node.children ?? [])
    .map((child) => typeof child === "string" ? child : collectText(child))
    .join(" ");
}

async function renderScreen(onBack = vi.fn(), onCreated = vi.fn()) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(<CreatePatientScreen onBack={onBack} onCreated={onCreated} />);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Create patient screen did not render");
  return { renderer, onBack, onCreated };
}

beforeEach(() => {
  createPatient.mockResolvedValue({ id: "patient-new" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CreatePatientScreen", () => {
  it("requires a non-blank full name before saving", async () => {
    const { renderer } = await renderScreen();
    const save = renderer.root.findByProps({ testID: "new-patient-save-button" });

    expect(save.props.disabled).toBe(true);

    await act(async () => {
      renderer.root.findByProps({ testID: "new-patient-fullname-input" }).props.onChangeText("  Ada Lovelace  ");
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ testID: "new-patient-save-button" }).props.disabled).toBe(false);
  });

  it("creates with a trimmed name, omits an empty phone, and opens the created record", async () => {
    const { renderer, onCreated } = await renderScreen();

    await act(async () => {
      renderer.root.findByProps({ testID: "new-patient-fullname-input" }).props.onChangeText("  Ada Lovelace  ");
      renderer.root.findByProps({ testID: "new-patient-phone-input" }).props.onChangeText("   ");
      await Promise.resolve();
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: "new-patient-save-button" }).props.onPress();
    });

    expect(createPatient).toHaveBeenCalledWith({ fullName: "Ada Lovelace" });
    expect(announceForAccessibility).toHaveBeenCalledWith("Patient added");
    expect(onCreated).toHaveBeenCalledWith("patient-new");
  });

  it("keeps entered values and shows safe inline feedback when creation fails", async () => {
    createPatient.mockRejectedValueOnce(new Error("untrusted server detail"));
    const { renderer, onCreated } = await renderScreen();

    await act(async () => {
      renderer.root.findByProps({ testID: "new-patient-fullname-input" }).props.onChangeText("Grace Hopper");
      renderer.root.findByProps({ testID: "new-patient-phone-input" }).props.onChangeText("555-0199");
      await Promise.resolve();
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: "new-patient-save-button" }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: "new-patient-fullname-input" }).props.value).toBe("Grace Hopper");
    expect(renderer.root.findByProps({ testID: "new-patient-phone-input" }).props.value).toBe("555-0199");
    expect(collectText(renderer.toJSON())).toContain("Something went wrong. Please try again.");
    expect(renderer.root.findByProps({ testID: "new-patient-error-message" }).props.accessibilityLiveRegion).toBe("polite");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("returns to the directory without creating a record", async () => {
    const { renderer, onBack } = await renderScreen();

    act(() => {
      renderer.root.findByProps({ testID: "new-patient-back-button" }).props.onPress();
    });

    expect(onBack).toHaveBeenCalledOnce();
    expect(createPatient).not.toHaveBeenCalled();
  });
});
