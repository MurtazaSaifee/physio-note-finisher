import { describe, expect, it } from "vitest";

import { formatTemplateProvenanceLabel } from "../../features/notes/screens/ManualSoapComposerScreen";

describe("template provenance labels", () => {
  it("formats built-in template provenance labels", () => {
    expect(
      formatTemplateProvenanceLabel(
        {
          label: "Knee pain",
          source: "built_in",
          category: "Knee",
          categories: ["Knee"],
        },
        "knee",
      ),
    ).toBe("Built-in • Knee pain • Knee");
  });

  it("formats custom template provenance labels with multiple categories", () => {
    expect(
      formatTemplateProvenanceLabel(
        {
          label: "Spine check",
          source: "custom",
          category: "General",
          categories: ["Spine", "General"],
        },
        "custom-template-id",
      ),
    ).toBe("Custom • Spine check • Spine, General");
  });

  it("shows fallback labels when the live template is not available", () => {
    expect(formatTemplateProvenanceLabel(null, "deleted-template-id")).toBe(
      "Previously applied template",
    );
    expect(formatTemplateProvenanceLabel(null, null)).toBe("No template applied");
  });

  it("prefers persisted historical snapshot labels over live template metadata", () => {
    expect(
      formatTemplateProvenanceLabel(
        {
          source: "custom",
          category: "General",
          categories: ["General"],
        },
        "custom-template-id",
        {
          templateLabel: "Original sports rehab",
          categoryLabels: ["Sports", "Return to play"],
          source: "custom",
          applyMode: "fillBlank",
        },
      ),
    ).toBe("Custom • Original sports rehab • Sports, Return to play");
  });
});
