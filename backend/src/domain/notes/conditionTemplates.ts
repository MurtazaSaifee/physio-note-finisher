import type {
  ConditionTemplate,
  ConditionTemplateKey,
  ConditionTemplateListResponse,
  TemplateCategory,
} from "../../../../shared/contracts/notes.js";
import { listCustomTemplates } from "./templateService.js";
import { CONDITION_TEMPLATES, TEMPLATE_CATEGORIES } from "./builtInTemplates.js";

type ListConditionTemplatesInput = {
  clinicId?: string;
  userId?: string;
  category?: TemplateCategory;
  query?: string;
  limit?: number;
  offset?: number;
  patientConditionTags?: string[];
  recentTemplateKeys?: string[];
};

function normalizeText(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function cloneTemplate(template: ConditionTemplate): ConditionTemplate {
  return {
    ...template,
    ...(template.categories ? { categories: [...template.categories] } : {}),
    conditionTags: [...template.conditionTags],
    sections: { ...template.sections },
  };
}

function applyFilters(templates: ConditionTemplate[], input: ListConditionTemplatesInput): ConditionTemplate[] {
  const normalizedQuery = normalizeText(input.query);
  return templates.filter((template) => {
    if (input.category && !(template.categories ?? [template.category]).includes(input.category)) return false;
    if (!normalizedQuery) return true;
    const haystack = [template.label, template.description, template.category, ...(template.categories ?? []), ...template.conditionTags, template.sections.subjective ?? "", template.sections.objective ?? "", template.sections.assessment ?? "", template.sections.plan ?? ""].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function applyLimit<T>(items: T[], limit: number | undefined, offset: number | undefined = 0): T[] {
  if (!limit || limit < 1) return items.slice(offset);
  return items.slice(offset, offset + limit);
}

function buildSuggestedTemplates(
  templates: ConditionTemplate[],
  patientConditionTags: string[] | undefined,
): ConditionTemplate[] {
  if (!patientConditionTags?.length) {
    return [];
  }

  const normalizedTags = new Set(
    patientConditionTags.map((tag) => normalizeText(tag)).filter(Boolean),
  );
  if (normalizedTags.size === 0) {
    return [];
  }

  return templates
    .map((template) => {
      const score = template.conditionTags.reduce((count, tag) => {
        return normalizedTags.has(normalizeText(tag)) ? count + 1 : count;
      }, 0);
      return { template, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.template.label.localeCompare(b.template.label);
    })
    .map((entry) => entry.template);
}

function buildRecentTemplates(
  templatesByKey: Map<string, ConditionTemplate>,
  recentTemplateKeys: string[] | undefined,
): ConditionTemplate[] {
  if (!recentTemplateKeys?.length) {
    return [];
  }

  const seen = new Set<string>();
  const recent: ConditionTemplate[] = [];

  for (const key of recentTemplateKeys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const template = templatesByKey.get(key);
    if (template) {
      recent.push(template);
    }
  }

  return recent;
}

export async function listConditionTemplates(input: ListConditionTemplatesInput = {}): Promise<ConditionTemplateListResponse> {
  let custom: ConditionTemplate[] = [];
  if (input.clinicId && input.userId) {
    const customRows = await listCustomTemplates({
      clinicId: input.clinicId,
      userId: input.userId,
      ...(input.query ? { query: input.query } : {}),
      ...(input.category ? { category: input.category } : {}),
    });

    custom = customRows.map((row) => ({
      key: row.id as ConditionTemplateKey,
      label: row.name,
      category: row.categories[0] ?? "General",
      categories: row.categories,
      source: "custom",
      description: row.categories.join(", "),
      conditionTags: row.categories,
      sections: row.sections,
    }));
  }

  const allTemplates = [...CONDITION_TEMPLATES, ...custom].map(cloneTemplate);
  const categories = Array.from(
    new Set([
      ...TEMPLATE_CATEGORIES,
      ...custom.flatMap((template) => template.categories ?? [template.category]),
    ]),
  );
  const templatesByKey = new Map(
    allTemplates.map((template) => [template.key, template] as const),
  );
  const filteredTemplates = applyFilters(allTemplates, input);
  const suggestedTemplates = applyLimit(
    buildSuggestedTemplates(filteredTemplates, input.patientConditionTags),
    input.limit,
  );
  const recentTemplates = applyLimit(
    buildRecentTemplates(templatesByKey, input.recentTemplateKeys),
    input.limit,
  );

  return {
    templates: applyLimit(filteredTemplates, input.limit, input.offset),
    suggestedTemplates,
    recentTemplates,
    categories,
  };
}
