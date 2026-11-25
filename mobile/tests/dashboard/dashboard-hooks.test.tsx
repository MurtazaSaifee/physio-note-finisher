import { describe, expect, it } from "vitest";

import { dashboardQueryKey } from "../../features/dashboard/hooks/useDashboard";

describe("dashboard hooks", () => {
  it("includes dashboard paging and search state in the query key", () => {
    expect(
      dashboardQueryKey({
        date: "2026-04-26",
        patientId: "patient-1",
        noteStatus: "draft",
        search: "Ada",
        page: 2,
        pageSize: 10,
      }),
    ).toEqual([
      "dashboard",
      "sessions",
      {
        date: "2026-04-26",
        patientId: "patient-1",
        noteStatus: "draft",
        search: "Ada",
        page: 2,
        pageSize: 10,
      },
    ]);
  });
});
