import { describe, expect, it } from "vitest";

import { ProfileUpdateSchema } from "./auth.js";

describe("shared authentication contracts", () => {
  it("accepts a non-empty clinician name", () => {
    expect(
      ProfileUpdateSchema.parse({
        firstName: "Demo",
        lastName: "Clinician",
      }),
    ).toEqual({
      firstName: "Demo",
      lastName: "Clinician",
    });
  });

  it("rejects an empty clinician name", () => {
    expect(() =>
      ProfileUpdateSchema.parse({
        firstName: "",
        lastName: "Clinician",
      }),
    ).toThrow();
  });
});
