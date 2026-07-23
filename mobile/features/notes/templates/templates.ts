import type {
  ConditionTemplate,
  SoapSections,
  TemplateApplyMode,
} from "../../../../shared/contracts/notes";

function hasVisibleText(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function cloneSections(sections: SoapSections): SoapSections {
  return {
    subjective: sections.subjective,
    objective: sections.objective,
    assessment: sections.assessment,
    plan: sections.plan,
  };
}

export function applyTemplateToSections(
  current: SoapSections,
  template: ConditionTemplate,
  mode: TemplateApplyMode,
): SoapSections {
  if (mode === "replaceAll") {
    return cloneSections(template.sections);
  }

  return {
    subjective: hasVisibleText(current.subjective)
      ? current.subjective
      : template.sections.subjective,
    objective: hasVisibleText(current.objective)
      ? current.objective
      : template.sections.objective,
    assessment: hasVisibleText(current.assessment)
      ? current.assessment
      : template.sections.assessment,
    plan: hasVisibleText(current.plan)
      ? current.plan
      : template.sections.plan,
  };
}
