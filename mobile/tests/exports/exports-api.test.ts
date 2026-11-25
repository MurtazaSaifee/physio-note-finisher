import { describe, expect, it, vi } from "vitest";

import { createExportsApi } from "../../features/exports/api/exportsApi";

describe("exports api", () => {
  it("accepts copied export records from the backend", async () => {
    const transport = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          success: true,
          data: {
            id: "export-1",
            sessionId: "session-1",
            action: "copied",
            type: "fullNote",
            format: "text",
            exportedByUserId: "user-1",
            fileStatus: null,
            fileError: null,
            fileExpiresAt: null,
            fileSizeBytes: null,
            createdAt: "2026-05-11T10:00:00.000Z",
          },
        };
      },
    }));

    const api = createExportsApi("https://api.example.com", transport);
    const record = await api.recordExportAction(
      "access-token",
      "clinic-1",
      "patient-1",
      "session-1",
      {
        action: "copied",
        type: "fullNote",
        format: "text",
      },
    );

    expect(record).toEqual(
      expect.objectContaining({
        id: "export-1",
        action: "copied",
        type: "fullNote",
        format: "text",
      }),
    );
  });
});
