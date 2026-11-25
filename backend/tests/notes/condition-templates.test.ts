import { afterEach, describe, expect, it, vi } from "vitest";

import { listConditionTemplates } from "../../src/domain/notes/conditionTemplates.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("conditionTemplates", () => {
  it("returns templates with metadata categories and scaffold sections", async () => {
    const response = await listConditionTemplates();
    const templates = response.templates;

    expect(templates).toHaveLength(13);
    expect(new Set(templates.map((template) => template.category))).toEqual(
      new Set([
        "Neurological",
        "Sports",
        "Orthopedic",
        "General",
      ]),
    );
    expect(templates.map((template) => template.key)).toEqual([
      "neuro_stroke_rehab",
      "neuro_parkinsons",
      "neuro_ms",
      "sports_acl_return",
      "sports_rotator_cuff",
      "sports_ankle_sprain",
      "ortho_tka",
      "ortho_cervical_radic",
      "ortho_plantar_fasciitis",
      "ortho_hip_oa",
      "gen_pelvic_floor",
      "gen_cardiac_rehab",
      "gen_chronic_pain",
    ]);
    expect(templates.map((template) => template.label)).toEqual([
      "Stroke Rehabilitation",
      "Parkinson's Disease Mgmt",
      "Multiple Sclerosis Eval",
      "ACL Return to Sport",
      "Overhead Athlete RC",
      "Acute Lateral Ankle Sprain",
      "Total Knee Arthroplasty",
      "Cervical Radiculopathy",
      "Plantar Fasciopathy",
      "Hip Osteoarthritis",
      "Pelvic Floor Dysfunction",
      "Cardiac Rehab Phase II",
      "Chronic Pain Management",
    ]);

    for (const template of templates) {
      expect(typeof template.description).toBe("string");
      expect(template.description.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(template.conditionTags)).toBe(true);
      expect(template.conditionTags.length).toBeGreaterThan(0);
      expect(template.sections.subjective?.trim().length).toBeGreaterThan(0);
      expect(template.sections.objective?.trim().length).toBeGreaterThan(0);
      expect(template.sections.assessment?.trim().length).toBeGreaterThan(0);
      expect(template.sections.plan?.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns defensive copies on each call", async () => {
    const first = (await listConditionTemplates()).templates;
    const second = (await listConditionTemplates()).templates;

    expect(first[0]).not.toBe(second[0]);
    expect(first[0]?.sections).not.toBe(second[0]?.sections);
    expect(first[0]?.conditionTags).not.toBe(second[0]?.conditionTags);

    if (first[0]) {
      first[0].label = "Mutated label";
      first[0].sections.subjective = "Mutated subjective";
      first[0].conditionTags[0] = "Mutated condition tag";
    }

    expect(second[0]?.label).toBe("Stroke Rehabilitation");
    expect(second[0]?.sections.subjective).toContain("fatigue");
    expect(second[0]?.conditionTags[0]).not.toBe("Mutated condition tag");
  });

  it("filters templates by category and case-insensitive query", async () => {
    const filteredByCategory = (await listConditionTemplates({
      category: "Sports",
    })).templates;
    const filteredByQuery = (await listConditionTemplates({
      query: "rehab",
    })).templates;

    expect(filteredByCategory.map((template) => template.key)).toEqual([
      "sports_acl_return",
      "sports_rotator_cuff",
      "sports_ankle_sprain",
    ]);
    expect(filteredByQuery.map((template) => template.key)).toEqual([
      "neuro_stroke_rehab",
      "sports_acl_return",
      "gen_cardiac_rehab",
    ]);
  });

  it("ranks suggested and recent templates from template history", async () => {
    const response = await listConditionTemplates({
      patientConditionTags: ["Balance", "Gait", "Post-op"],
      recentTemplateKeys: ["sports_acl_return", "neuro_ms", "sports_acl_return", "ortho_tka"],
      limit: 2,
    });

    expect(response.suggestedTemplates.map((template) => template.key)).toEqual([
      "sports_acl_return",
      "neuro_ms",
    ]);
    expect(response.recentTemplates.map((template) => template.key)).toEqual([
      "sports_acl_return",
      "neuro_ms",
    ]);
    expect(response.templates).toHaveLength(2);
  });
});
