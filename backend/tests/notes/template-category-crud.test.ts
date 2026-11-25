import { describe, expect, it } from "vitest";

import {
  createCustomTemplateSchema,
  updateCustomTemplateSchema,
} from "../../src/domain/notes/noteSchemas.js";

describe("template-category crud schemas", () => {
  it("accepts valid custom template payload with multi-category mapping", () => {
    const result = createCustomTemplateSchema.safeParse({
      name: "Thoracic mobility reset",
      categories: ["Spine", "Vestibular"],
      sections: {
        subjective: "Pain decreases after movement prep.",
        objective: "",
        assessment: null,
        plan: null,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categories).toEqual(["Spine", "Vestibular"]);
    }
  });

  it("rejects invalid create payloads with no categories or no section content", () => {
    const emptySections = createCustomTemplateSchema.safeParse({
      name: "Bad template",
      categories: ["Spine"],
      sections: {
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
      },
    });
    const noCategories = createCustomTemplateSchema.safeParse({
      name: "Bad template",
      categories: [],
      sections: {
        subjective: "Some note",
        objective: null,
        assessment: null,
        plan: null,
      },
    });

    expect(emptySections.success).toBe(false);
    expect(noCategories.success).toBe(false);
  });

  it("rejects owner spoofing fields from client payloads", () => {
    const result = createCustomTemplateSchema.safeParse({
      name: "Knee progression",
      categories: ["Knee"],
      sections: {
        subjective: "Loading is tolerated.",
        objective: null,
        assessment: null,
        plan: null,
      },
      ownerUserId: "evil-user",
    });

    expect(result.success).toBe(false);
  });

  it("requires update payload to include at least one mutable field", () => {
    const empty = updateCustomTemplateSchema.safeParse({});
    const valid = updateCustomTemplateSchema.safeParse({
      name: "Renamed template",
    });

    expect(empty.success).toBe(false);
    expect(valid.success).toBe(true);
  });
});
