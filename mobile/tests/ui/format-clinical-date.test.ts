import { afterEach, describe, expect, it } from "vitest";

import { formatClinicalDate } from "../../features/ui/formatClinicalDate";

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimezone;
  }
});

describe("formatClinicalDate", () => {
  it("keeps date-only clinical values on the same calendar day in a negative timezone", () => {
    process.env.TZ = "America/Los_Angeles";

    expect(formatClinicalDate("2026-04-30")).toBe("Apr 30, 2026");
  });

  it("still formats date-time values using their represented instant", () => {
    expect(formatClinicalDate("2026-04-30T12:00:00.000Z")).toBeTruthy();
  });
});
