import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSyncState,
  getDeadLetterChanges,
  startSyncReplay,
  resetSyncState,
} from "../../features/offline/services/syncService";
import {
  clearDeadLetterQueue,
  clearQueue,
  getQueuedChanges,
  saveQueuedChange,
} from "../../features/offline/storage/queueStore";

describe("syncService", () => {
  beforeEach(() => {
    clearQueue();
    clearDeadLetterQueue();
    resetSyncState();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes queued changes in order and stops when empty", async () => {
    const calls: string[] = [];
    const runAuthenticatedRequest = async <T,>(
      request: (accessToken: string) => Promise<T>,
    ): Promise<T> => {
      const result = await request("token");
      return result;
    };

    saveQueuedChange({
      id: "id-1",
      type: "noteEdit",
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "S1",
        objective: "O1",
        assessment: "A1",
        plan: "P1",
      },
      timestamp: 1000,
    });

    saveQueuedChange({
      id: "id-2",
      type: "appointmentEdit",
      appointmentId: "appt-1",
      updates: { scheduledAt: "2026-05-01T09:00:00Z" },
      timestamp: 2000,
    });

    await startSyncReplay({
      runAuthenticatedRequest,
      apis: {
        saveManualNote: async () => {
          calls.push("saveManualNote");
        },
        updateAppointment: async () => {
          calls.push("updateAppointment");
        },
      },
    });

    expect(calls).toEqual(["saveManualNote", "updateAppointment"]);
    expect(getSyncState().status).toBe("idle");
    expect(getSyncState().pendingCount).toBe(0);
  });

  it("retries failed items with exponential backoff then marks failed", async () => {
    const calls: string[] = [];
    const runAuthenticatedRequest = async <T,>(
      request: (accessToken: string) => Promise<T>,
    ): Promise<T> => request("token");

    saveQueuedChange({
      id: "id-1",
      type: "noteEdit",
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "S1",
        objective: "O1",
        assessment: "A1",
        plan: "P1",
      },
      timestamp: 1000,
    });

    const promise = startSyncReplay({
      runAuthenticatedRequest,
      apis: {
        saveManualNote: async () => {
          calls.push("saveManualNote");
          throw new Error("Network error");
        },
        updateAppointment: async () => {
          calls.push("updateAppointment");
        },
      },
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["saveManualNote"]);
    expect(getSyncState().status).toBe("syncing");

    // First retry after 5s
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual(["saveManualNote", "saveManualNote"]);

    // Second retry after 15s
    await vi.advanceTimersByTimeAsync(15000);
    expect(calls).toEqual(["saveManualNote", "saveManualNote", "saveManualNote"]);

    // Third retry after 45s
    await vi.advanceTimersByTimeAsync(45000);
    expect(calls).toEqual([
      "saveManualNote",
      "saveManualNote",
      "saveManualNote",
      "saveManualNote",
    ]);

    await promise;

    expect(getSyncState().status).toBe("failed");
    expect(getSyncState().pendingCount).toBe(1);
    expect(getSyncState().lastError).toContain("Network error");
  });

  it("uses one replay lease when two replays start at the same time", async () => {
    let releaseReplay: (() => void) | undefined;
    const runAuthenticatedRequest = async <T,>(
      request: (accessToken: string) => Promise<T>,
    ): Promise<T> => request("token");
    const saveManualNote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseReplay = resolve;
        }),
    );

    saveQueuedChange({
      id: "id-1",
      type: "noteEdit",
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "S1",
        objective: "O1",
        assessment: "A1",
        plan: "P1",
      },
      timestamp: 1000,
    });

    const replayA = startSyncReplay({
      runAuthenticatedRequest,
      apis: { saveManualNote },
    });
    const replayB = startSyncReplay({
      runAuthenticatedRequest,
      apis: { saveManualNote },
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(saveManualNote).toHaveBeenCalledTimes(1);

    releaseReplay?.();
    await Promise.all([replayA, replayB]);

    expect(getQueuedChanges()).toHaveLength(0);
    expect(getSyncState().status).toBe("idle");
  });

  it("moves permanent failures to dead letter instead of deleting them silently", async () => {
    const runAuthenticatedRequest = async <T,>(
      request: (accessToken: string) => Promise<T>,
    ): Promise<T> => request("token");

    saveQueuedChange({
      id: "id-1",
      type: "noteEdit",
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "S1",
        objective: "O1",
        assessment: "A1",
        plan: "P1",
      },
      timestamp: 1000,
    });

    await startSyncReplay({
      runAuthenticatedRequest,
      apis: {
        saveManualNote: async () => {
          throw new Error("409 conflict");
        },
      },
    });

    expect(getQueuedChanges()).toHaveLength(0);
    expect(getDeadLetterChanges()).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({ id: "id-1" }),
        error: "409 conflict",
      }),
    ]);
    expect(getSyncState()).toEqual(
      expect.objectContaining({
        status: "failed",
        pendingCount: 0,
        lastError: "1 item needs manual review before it can sync.",
      }),
    );
  });
});
