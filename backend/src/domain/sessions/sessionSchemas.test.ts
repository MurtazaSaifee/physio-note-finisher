import { describe, expect, it } from "vitest";

import { createSessionEntrySchema } from "./sessionSchemas.js";

describe("session creation schema", () => {
  it("accepts a new draft session", () => {
    expect(
      createSessionEntrySchema.parse({
        startedAt: "2026-07-23T10:00:00.000Z",
        visitType: "Follow-up",
        noteStatus: "draft",
      }).noteStatus,
    ).toBe("draft");
  });

  it("does not allow direct creation of a finalized session", () => {
    expect(() =>
      createSessionEntrySchema.parse({
        startedAt: "2026-07-23T10:00:00.000Z",
        visitType: "Follow-up",
        noteStatus: "finalized",
        finalNote: "Unreviewed final note",
      }),
    ).toThrow();
  });
});
