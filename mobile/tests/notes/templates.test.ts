import { describe, expect, it } from "vitest";

import type { ConditionTemplate, SoapSections } from "../../../shared/contracts/notes";
import { applyTemplateToSections } from "../../features/notes/templates/templates";

const template: ConditionTemplate = {
  key: "knee",
  label: "Knee pain",
  category: "Knee",
  description: "Knee pain template",
  conditionTags: ["Knee", "Pain"],
  sections: {
    subjective: "Template subjective",
    objective: "Template objective",
    assessment: "Template assessment",
    plan: "Template plan",
  },
};

describe("applyTemplateToSections", () => {
  it("fills only blank or whitespace-only sections in fillBlank mode", () => {
    const current: SoapSections = {
      subjective: "Existing subjective",
      objective: "   ",
      assessment: null,
      plan: "Existing plan",
    };

    const result = applyTemplateToSections(current, template, "fillBlank");

    expect(result).toEqual({
      subjective: "Existing subjective",
      objective: "Template objective",
      assessment: "Template assessment",
      plan: "Existing plan",
    });
    expect(result).not.toBe(current);
  });

  it("replaces all sections in replaceAll mode", () => {
    const current: SoapSections = {
      subjective: "Existing subjective",
      objective: "Existing objective",
      assessment: "Existing assessment",
      plan: "Existing plan",
    };

    const result = applyTemplateToSections(current, template, "replaceAll");

    expect(result).toEqual(template.sections);
    expect(result).not.toBe(current);
    expect(result).not.toBe(template.sections);
  });

  it("does not mutate the current sections or template definition", () => {
    const current: SoapSections = {
      subjective: "Existing subjective",
      objective: null,
      assessment: "",
      plan: "Existing plan",
    };
    const currentSnapshot = { ...current };
    const templateSnapshot = { ...template.sections };

    const result = applyTemplateToSections(current, template, "fillBlank");

    expect(current).toEqual(currentSnapshot);
    expect(template.sections).toEqual(templateSnapshot);
    expect(typeof result.subjective).toBe("string");
    expect(typeof result.objective).toBe("string");
    expect(typeof result.assessment).toBe("string");
    expect(typeof result.plan).toBe("string");
  });
});
