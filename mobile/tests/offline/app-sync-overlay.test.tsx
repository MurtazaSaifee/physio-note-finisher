import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  syncApis: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../features/offline/hooks/useSyncStatus", () => ({
  useSyncStatus: (apis: Record<string, unknown>) => {
    harness.syncApis = apis;
    return {
      state: { status: "failed", pendingCount: 1, isOnline: true },
    };
  },
}));

vi.mock("../../features/offline/components/SyncOverlay", () => ({
  SyncOverlay: ({ syncState }: { syncState: { status: string } }) =>
    syncState.status === "failed" ? React.createElement("View", { testID: "sync-error-state" }) : null,
}));

vi.mock("../../features/notes/api/notesApi", () => ({
  notesApi: {
    createManualNote: vi.fn(),
    saveManualNote: vi.fn(),
  },
}));

vi.mock("../../features/appointments/api/appointmentsApi", () => ({
  appointmentsApi: {
    updateAppointment: vi.fn(),
  },
}));

describe("AppSyncOverlay", () => {
  it("shows failed sync recovery and supplies replay handlers", async () => {
    const { AppSyncOverlay } = await import("../../features/offline/components/AppSyncOverlay");
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(AppSyncOverlay));
      await Promise.resolve();
    });

    expect(renderer?.root.findByProps({ testID: "sync-error-state" })).toBeTruthy();
    expect(harness.syncApis).toMatchObject({
      createManualNote: expect.any(Function),
      saveManualNote: expect.any(Function),
      updateAppointment: expect.any(Function),
    });
  });
});
