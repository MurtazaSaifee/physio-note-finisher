import { describe, it, expect, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

import { meridian } from "../../features/ui/meridian/tokens";
import { typography } from "../../features/ui/meridian/typography";
import {
  MeridianButton,
  MeridianCard,
  MeridianInput,
  MeridianChip,
  MeridianStatusPill,
  MeridianActionSurface,
  MeridianRow,
  MeridianEmptyState,
} from "../../features/ui/meridian/primitives";

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Failed to render");
  return renderer;
}

function collectText(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map(collectText).join(" ");
  }

  const children = node.children ?? [];
  return [
    typeof node === "string" ? node : "",
    ...children.map((child) =>
      typeof child === "string" ? child : collectText(child),
    ),
  ]
    .filter(Boolean)
    .join(" ");
}

function flattenStyle(style: unknown): Record<string, unknown> {
  const styles = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...styles.filter(Boolean));
}

describe("Meridian Primitives & Tokens", () => {
  it("uses the indigo action color for quiet utility", () => {
    expect(meridian.color.primary).toBe("#3F527A");
  });

  it("uses the approved warm quiet-utility palette", () => {
    expect(meridian.color.primarySoft).toBe("#E8ECF6");
    expect(meridian.color.background).toBe("#F6F4EF");
    expect(meridian.color.surface).toBe("#FBFAF7");
    expect(meridian.color.text).toBe("#1D2734");
    expect(meridian.color.textSubtle).toBe("#657080");
    expect(meridian.color.border).toBe("#D9DCD8");
    expect(meridian.radius.chip).toBe(999);
    expect(meridian.radius.control).toBe(12);
    expect(meridian.radius.card).toBe(12);
    expect(meridian.radius.dock).toBe(16);
  });

  it("exports correct touch target sizes", () => {
    expect(meridian.touchTarget.visible).toBe(44);
    expect(meridian.touchTarget.hit).toBe(48);
  });

  it("exports correct typography families", () => {
    expect(typography.display.fontFamily).toContain("Manrope");
    expect(typography.heading.fontFamily).toContain("Manrope");
    expect(typography.body.fontFamily).toContain("PublicSans");
    expect(typography.label.fontFamily).toContain("PublicSans");
  });

  it("uses non-negative letter spacing for typography", () => {
    Object.values(typography).forEach((style) => {
      expect(style.letterSpacing).toBe(0);
    });
  });

  describe("MeridianButton", () => {
    it("renders accessibilityRole and disabled state", async () => {
      const renderer = await render(
        <MeridianButton label="Test Button" disabled={true} />
      );
      const root = renderer.root;
      const button = root.findByProps({ accessibilityRole: "button" });
      expect(button.props.disabled).toBe(true);
      expect(button.props.accessibilityRole).toBe("button");
      expect(button.props.accessibilityState.disabled).toBe(true);
      expect(collectText(renderer.toJSON())).toContain("Test Button");
    });

    it("forwards an accessibility hint when one is provided", async () => {
      const renderer = await render(
        <MeridianButton
          label="Start Session"
          accessibilityHint="Start Session becomes available one hour before this visit."
          disabled={true}
        />,
      );
      const button = renderer.root.findByProps({ accessibilityRole: "button" });

      expect(button.props.accessibilityHint).toBe(
        "Start Session becomes available one hour before this visit.",
      );
      expect(button.props.accessibilityState).toEqual({ disabled: true });
    });

    it("keeps disabled primary labels legible while visibly disabled", async () => {
      const renderer = await render(
        <MeridianButton
          label="Save note"
          disabled={true}
          testID="save-note-button"
        />,
      );
      const button = renderer.root
        .findAllByType("Pressable")
        .find((node) => node.props.testID === "save-note-button");
      if (!button) throw new Error("Disabled button was not rendered");
      const buttonStyle = flattenStyle(button.props.style({ pressed: false }));
      const label = renderer.root.findByType("Text");
      const labelStyle = flattenStyle(label.props.style);
      const pressedButtonStyle = flattenStyle(button.props.style({ pressed: true }));

      expect(buttonStyle.minHeight).toBe(meridian.touchTarget.hit);
      expect(buttonStyle.backgroundColor).toBe(meridian.color.surfaceMuted);
      expect(buttonStyle.borderColor).toBe(meridian.color.border);
      expect(buttonStyle.borderWidth).toBe(1);
      expect(buttonStyle.opacity ?? 1).toBe(1);
      expect(pressedButtonStyle.opacity ?? 1).toBe(1);
      expect(pressedButtonStyle.transform).toBeUndefined();
      expect(labelStyle.color).toBe(meridian.color.textSubtle);
      expect(button.props.accessibilityState).toEqual({ disabled: true });
    });

    it("keeps secondary actions quiet instead of presenting a second filled tile", async () => {
      const renderer = await render(<MeridianButton label="Secondary" variant="secondary" />);
      const button = renderer.root.findByProps({ accessibilityRole: "button" });
      const style = flattenStyle(button.props.style({ pressed: false }));

      expect(style).toMatchObject({
        backgroundColor: meridian.color.surface,
        borderColor: meridian.color.border,
        borderWidth: 1,
      });
    });
  });

  describe("MeridianInput", () => {
    it("forwards props correctly", async () => {
      const onChange = vi.fn();
      const renderer = await render(
        <MeridianInput
          placeholder="Test Input"
          value="Test Value"
          onChangeText={onChange}
          editable={false}
          multiline={true}
        />
      );
      const root = renderer.root;
      const input = root.findByProps({ placeholder: "Test Input" });
      
      expect(input.props.value).toBe("Test Value");
      expect(input.props.editable).toBe(false);
      expect(input.props.multiline).toBe(true);
      
      act(() => {
        input.props.onChangeText("New Value");
      });
      expect(onChange).toHaveBeenCalledWith("New Value");
    });
  });

  it("keeps MeridianCard free of decorative accent stripes", async () => {
    const renderer = await render(<MeridianCard accent>Content</MeridianCard>);
    const styles = renderer.root.findAllByType("View").map((view) => flattenStyle(view.props.style));

    expect(styles.some((style) => style.width === 4 && style.backgroundColor === meridian.color.primary)).toBe(false);
  });

  describe("MeridianStatusPill", () => {
    it("maps statuses to correct styles", async () => {
      const draft = await render(<MeridianStatusPill status="draft" label="Draft" />);
      const reopened = await render(<MeridianStatusPill status="reopened" label="Reopened" />);
      const finalized = await render(<MeridianStatusPill status="finalized" label="Finalized" />);
      const archived = await render(<MeridianStatusPill status="archived" label="Archived" />);

      // Find the root View for each pill and check its style array for the expected background color
      const draftView = draft.root.findAllByType("View")[0];
      const draftStyle = draftView.props.style.flat().find((s: any) => s && s.backgroundColor === meridian.color.warningSoft);
      expect(draftStyle).toBeTruthy();

      const reopenedView = reopened.root.findAllByType("View")[0];
      const reopenedStyle = reopenedView.props.style.flat().find((s: any) => s && s.backgroundColor === meridian.color.warningSoft);
      expect(reopenedStyle).toBeTruthy();

      const finalizedView = finalized.root.findAllByType("View")[0];
      const finalizedStyle = finalizedView.props.style.flat().find((s: any) => s && s.backgroundColor === meridian.color.successSoft);
      expect(finalizedStyle).toBeTruthy();

      const archivedView = archived.root.findAllByType("View")[0];
      const archivedStyle = archivedView.props.style.flat().find((s: any) => s && s.backgroundColor === meridian.color.errorSurface);
      expect(archivedStyle).toBeTruthy();
    });

    it("maps saved status to title case and a soft success treatment", async () => {
      const saved = await render(<MeridianStatusPill status="saved" label="saved" />);
      const savedView = saved.root.findAllByType("View")[0];
      const savedStyle = savedView.props.style.flat().find((s: any) => s && s.backgroundColor === meridian.color.successSoft);

      expect(savedStyle).toBeTruthy();
      expect(collectText(saved.toJSON())).toContain("Saved");
      expect(collectText(saved.toJSON())).not.toContain("saved");
    });
  });

  it("renders non-interactive chips without an inert button role", async () => {
    const renderer = await render(<MeridianChip label="ankle" />);

    expect(renderer.root.findAllByProps({ accessibilityRole: "button" })).toHaveLength(0);
    expect(collectText(renderer.toJSON())).toContain("ankle");
  });

  describe("MeridianRow and MeridianEmptyState", () => {
    it("uses ordinary bordered rows for secondary actions and keeps empty states plain", async () => {
      const row = await render(
        <MeridianRow
          title="View history"
          subtitle="Review prior visits"
          onPress={vi.fn()}
          testID="patient-history-row"
        />,
      );
      const rowPressable = row.root
        .findAllByType("Pressable")
        .find((node) => node.props.testID === "patient-history-row");

      expect(rowPressable?.props.accessibilityRole).toBe("button");
      const rowStyle = typeof rowPressable?.props.style === "function"
        ? rowPressable.props.style({ pressed: false })
        : rowPressable?.props.style;
      expect(flattenStyle(rowStyle)).toMatchObject({
        backgroundColor: "transparent",
        borderBottomColor: meridian.color.border,
        borderBottomWidth: 1,
      });

      const empty = await render(
        <MeridianEmptyState
          title="No appointments"
          message="Scheduled visits will appear here."
          action={<MeridianButton label="Create appointment" testID="create-appointment-button" />}
          testID="calendar-empty-state"
        />,
      );

      expect(collectText(empty.toJSON())).toContain("No appointments");
      expect(collectText(empty.toJSON())).toContain("Scheduled visits will appear here.");
      expect(empty.root.findByProps({ testID: "create-appointment-button" })).toBeTruthy();
    });
  });

  describe("MeridianActionSurface", () => {
    it("supports disabled accessibility state", async () => {
      const renderer = await render(
        <MeridianActionSurface title="Test Action" disabled={true} />
      );
      const root = renderer.root;
      const surface = root.findByProps({ accessibilityRole: "button" });
      expect(surface.props.accessibilityState.disabled).toBe(true);
      expect(collectText(renderer.toJSON())).toContain("Coming soon");
    });
  });
});
