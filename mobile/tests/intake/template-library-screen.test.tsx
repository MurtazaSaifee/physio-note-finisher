import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
  }: {
    data?: unknown[];
    renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
  }) => (
    <React.Fragment>
      {ListHeaderComponent}
      {(data ?? []).map((item, index) => {
        const key =
          item && typeof item === "object" && "key" in item && typeof item.key === "string"
            ? item.key
            : String(index);
        return <React.Fragment key={key}>{renderItem({ item, index })}</React.Fragment>;
      })}
    </React.Fragment>
  ),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

const hookState = vi.hoisted(() => ({
  data: {
    categories: [
      "Spine",
      "Shoulder",
      "Knee",
      "Elbow",
      "Post-op",
      "Balance/Gait",
      "General",
      "Sports",
    ],
    suggestedTemplates: [
      {
        key: "knee",
        label: "Knee pain",
        category: "Knee",
        categories: ["Knee", "Sports"],
        source: "custom",
        description: "Knee pain follow-up with swelling and load tolerance checks.",
        conditionTags: ["Knee", "Swelling"],
        sections: {
          subjective: "Subjective template",
          objective: "Objective template",
          assessment: "Assessment template",
          plan: "Plan template",
        },
      },
    ],
    recentTemplates: [
      {
        key: "post_op",
        label: "Post-operative rehab",
        category: "Post-op",
        description: "Post-op progress review.",
        conditionTags: ["Post-op"],
        sections: {
          subjective: "Recent subjective",
          objective: "Recent objective",
          assessment: "Recent assessment",
          plan: "Recent plan",
        },
      },
    ],
    templates: [
      {
        key: "knee",
        label: "Knee pain",
        category: "Knee",
        description: "Knee pain follow-up with swelling and load tolerance checks.",
        conditionTags: ["Knee", "Swelling"],
        sections: {
          subjective: "Subjective template",
          objective: "Objective template",
          assessment: "Assessment template",
          plan: "Plan template",
        },
      },
      {
        key: "balance_gait",
        label: "Balance and gait",
        category: "Balance/Gait",
        description: "Balance and gait progression.",
        conditionTags: ["Balance", "Gait"],
        sections: {
          subjective: "Balance subjective",
          objective: "Balance objective",
          assessment: "Balance assessment",
          plan: "Balance plan",
        },
      },
    ],
  },
  isLoading: false,
}));

const mockFns = vi.hoisted(() => ({
  useConditionTemplates: vi.fn(() => hookState),
}));

vi.mock("../../features/notes/hooks/useNotes.js", () => ({
  useConditionTemplates: mockFns.useConditionTemplates,
}));

import { TemplateLibraryScreen } from "../../features/intake/screens/TemplateLibraryScreen";
import { meridian } from "../../features/ui/meridian/tokens";

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

function instanceText(instance: TestRenderer.ReactTestInstance): string {
  return instance.children
    .map((child) => (typeof child === "string" ? child : instanceText(child)))
    .join(" ");
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("TemplateLibraryScreen", () => {
  it("renders blank session path, search, and template sections", async () => {
    const onBack = vi.fn();
    const onStartBlank = vi.fn();
    const onUseTemplate = vi.fn();

    const renderer = await render(
      <TemplateLibraryScreen
        patientId="patient-1"
        onBack={onBack}
        onStartBlank={onStartBlank}
        onUseTemplate={onUseTemplate}
      />,
    );

    const text = collectText(renderer.toJSON());
    expect(text).toContain("Start without Template");
    expect(text).toContain("Library Actions");
    expect(text).toContain("Suggested for this patient");
    expect(text).toContain("Recent templates");
    expect(text).toContain("Knee");
    expect(text).toContain("Sports");
    expect(text).toContain("Post-op");
    expect(text).toContain("Balance/Gait");

    const textInputs = renderer.root.findAllByType("TextInput");
    expect(textInputs[0]?.props.placeholder).toBe("Search templates...");

    const pressables = renderer.root.findAllByType("Pressable");
    const blankButton = pressables.find((pressable) =>
      instanceText(pressable).includes("Start without Template"),
    );

    await act(async () => {
      blankButton?.props.onPress();
    });

    expect(onStartBlank).toHaveBeenCalledWith("patient-1");
    expect(mockFns.useConditionTemplates).toHaveBeenCalled();
  });

  it("keeps a deliberate section gap between search and library actions", async () => {
    const renderer = await render(
      <TemplateLibraryScreen
        patientId="patient-1"
        onBack={() => undefined}
        onStartBlank={() => undefined}
        onUseTemplate={() => undefined}
      />,
    );

    const libraryActionsHeading = renderer.root
      .findAllByType("Text")
      .find((heading) => heading.children.length === 1 && heading.children[0] === "Library Actions");
    const sectionStyle = libraryActionsHeading?.parent?.props.style;
    const styles = Array.isArray(sectionStyle) ? sectionStyle : [sectionStyle];
    const sectionGap = styles.find(
      (style): style is { marginTop?: unknown } =>
        Boolean(style) && typeof style === "object" && "marginTop" in style,
    )?.marginTop;

    expect(sectionGap).toBeGreaterThanOrEqual(meridian.spacing.md);
  });

  it("opens preview on card press and calls onUseTemplate only on Use template", async () => {
    const onBack = vi.fn();
    const onStartBlank = vi.fn();
    const onUseTemplate = vi.fn();

    const renderer = await render(
      <TemplateLibraryScreen
        patientId="patient-1"
        onBack={onBack}
        onStartBlank={onStartBlank}
        onUseTemplate={onUseTemplate}
      />,
    );

    const firstTemplateCard = renderer.root
      .findAllByType("Pressable")
      .find((pressable) => instanceText(pressable).includes("Knee pain"));
    expect(firstTemplateCard).toBeTruthy();

    const templateCardAgain = renderer.root
      .findAllByType("Pressable")
      .find((pressable) => instanceText(pressable).includes("Knee pain"));
    await act(async () => {
      templateCardAgain?.props.onPress();
    });

    expect(onUseTemplate).not.toHaveBeenCalled();

    const previewText = collectText(renderer.toJSON());
    expect(previewText).toContain("Subjective");
    expect(previewText).toContain("Objective");
    expect(previewText).toContain("Assessment");
    expect(previewText).toContain("Plan");
    expect(previewText).toContain("Use template");
    expect(previewText).not.toContain("Back to templates");

    const useTemplateButton = renderer.root
      .findAllByType("Pressable")
      .find((pressable) => instanceText(pressable).includes("Use template"));
    const backButton = renderer.root.findByProps({
      testID: "template-library-preview-back-button",
    });
    expect(useTemplateButton).toBeTruthy();
    expect(backButton).toBeTruthy();

    await act(async () => {
      backButton?.props.onPress();
    });

    expect(collectText(renderer.toJSON())).toContain("Start without Template");
    expect(collectText(renderer.toJSON())).not.toContain("Use template");
    expect(onUseTemplate).not.toHaveBeenCalled();

    const templateCardForUse = renderer.root
      .findAllByType("Pressable")
      .find((pressable) => instanceText(pressable).includes("Knee pain"));
    await act(async () => {
      templateCardForUse?.props.onPress();
    });
    const useTemplateButtonForUse = renderer.root
      .findAllByType("Pressable")
      .find((pressable) => instanceText(pressable).includes("Use template"));
    await act(async () => {
      useTemplateButtonForUse?.props.onPress();
    });

    expect(onUseTemplate).toHaveBeenCalledWith("patient-1", "knee");
  });

  it("uses explicit SOAP section labels in the template preview", async () => {
    const renderer = await render(
      <TemplateLibraryScreen
        patientId="patient-1"
        onBack={() => undefined}
        onStartBlank={() => undefined}
        onUseTemplate={() => undefined}
      />,
    );

    const templateCard = renderer.root
      .findAllByType("Pressable")
      .find((pressable) => instanceText(pressable).includes("Knee pain"));

    await act(async () => {
      templateCard?.props.onPress();
    });

    for (const label of ["Subjective", "Objective", "Assessment", "Plan"]) {
      expect(
        renderer.root.findAll(
          (node) => node.type === "Text" && node.children.length === 1 && node.children[0] === label,
        ),
      ).toHaveLength(1);
    }
  });

  it("gives every template card a unique target across library sections", async () => {
    const renderer = await render(
      <TemplateLibraryScreen
        patientId="patient-1"
        onBack={() => undefined}
        onStartBlank={() => undefined}
        onUseTemplate={() => undefined}
      />,
    );

    const cardTestIDs = renderer.root
      .findAllByType("Pressable")
      .map((pressable) => pressable.props.testID)
      .filter((testID): testID is string => typeof testID === "string" && testID.startsWith("template-library-template-"));

    expect(cardTestIDs.length).toBeGreaterThan(1);
    expect(new Set(cardTestIDs).size).toBe(cardTestIDs.length);
  });
});
