import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import {
  clearDraft,
  clearOfflinePhiData,
  clearQueue,
  getDraft,
  getQueuedChanges,
  removeQueuedChange,
  saveDraft,
  saveQueuedChange,
  setMmkvImplementation,
} from "../../features/offline/storage/queueStore";

describe("queueStore", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    setMmkvImplementation(null as unknown as Parameters<typeof setMmkvImplementation>[0]);
    clearOfflinePhiData();
  });

  it("saves and retrieves a note edit queued item", () => {
    const change = {
      id: "id-1",
      type: "noteEdit" as const,
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "Pain in lower back",
        objective: "Limited flexion",
        assessment: "Muscle strain",
        plan: "Continue exercises",
      },
      timestamp: Date.now(),
    };

    saveQueuedChange(change);
    const queued = getQueuedChanges();

    expect(queued).toHaveLength(1);
    expect(queued[0]).toEqual(change);
  });

  it("generates a queued item id with crypto randomness when one is missing", () => {
    saveQueuedChange({
      type: "noteEdit" as const,
      sessionId: "session-uuid",
      patientId: "patient-uuid",
      sections: {
        subjective: "Back pain",
        objective: "",
        assessment: "",
        plan: "",
      },
      timestamp: 42,
    } as any);

    expect(vi.mocked(randomUUID)).toHaveBeenCalledTimes(2);
    expect(getQueuedChanges()).toHaveLength(1);
    expect(getQueuedChanges()[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      type: "noteEdit",
      sessionId: "session-uuid",
      patientId: "patient-uuid",
      sections: {
        subjective: "Back pain",
        objective: "",
        assessment: "",
        plan: "",
      },
      timestamp: 42,
    });
  });

  it("removes completed items and returns empty array when cleared", () => {
    const change1 = {
      id: "id-1",
      type: "noteEdit" as const,
      sessionId: "session-1",
      patientId: "patient-1",
      sections: {
        subjective: "Pain",
        objective: "Limited",
        assessment: "Strain",
        plan: "Exercises",
      },
      timestamp: 1000,
    };
    const change2 = {
      id: "id-2",
      type: "appointmentEdit" as const,
      appointmentId: "appt-1",
      updates: { scheduledAt: "2026-05-01T09:00:00Z" },
      timestamp: 2000,
    };

    saveQueuedChange(change1);
    saveQueuedChange(change2);
    expect(getQueuedChanges()).toHaveLength(2);

    removeQueuedChange(change1.id);
    expect(getQueuedChanges()).toHaveLength(1);
    expect(getQueuedChanges()[0]).toEqual(change2);

    clearQueue();
    expect(getQueuedChanges()).toHaveLength(0);
  });

  it("saves and retrieves draft state by sessionId", () => {
    const sessionId = "session-1";
    const sections = {
      subjective: "Back pain",
      objective: "Stiffness",
      assessment: "Mild strain",
      plan: "Rest and ice",
    };

    expect(getDraft(sessionId)).toBeNull();

    saveDraft(sessionId, sections);
    const draft = getDraft(sessionId);

    expect(draft).toEqual(sections);
  });

  it("clears draft for a session", () => {
    const sessionId = "session-1";
    saveDraft(sessionId, {
      subjective: "Pain",
      objective: "Swelling",
      assessment: "Sprain",
      plan: "RICE",
    });

    clearDraft(sessionId);
    expect(getDraft(sessionId)).toBeNull();
  });

  it("throws when queue reaches max size instead of silently dropping", () => {
    for (let i = 0; i < 500; i++) {
      saveQueuedChange({
        id: `id-${i}`,
        type: "noteEdit" as const,
        sessionId: `session-${i}`,
        patientId: "patient-1",
        sections: {
          subjective: `Note ${i}`,
          objective: "",
          assessment: "",
          plan: "",
        },
        timestamp: i,
      });
    }

    expect(getQueuedChanges()).toHaveLength(500);

    expect(() =>
      saveQueuedChange({
        id: "overflow-id",
        type: "noteEdit" as const,
        sessionId: "overflow-session",
        patientId: "patient-1",
        sections: {
          subjective: "Overflow",
          objective: "",
          assessment: "",
          plan: "",
        },
        timestamp: 9999,
      }),
    ).toThrow("Offline queue is full. Please sync before making more changes.");
  });

  it("persists production queued changes in secure storage", () => {
    vi.stubEnv("APP_VARIANT", "production");

    saveQueuedChange({
      id: "prod-offline-1",
      type: "noteEdit" as const,
      sessionId: "session-prod",
      patientId: "patient-prod",
      sections: {
        subjective: "PHI draft",
        objective: "",
        assessment: "",
        plan: "",
      },
      timestamp: 1,
    });

    expect(getQueuedChanges()).toEqual([
      expect.objectContaining({
        id: "prod-offline-1",
        sessionId: "session-prod",
      }),
    ]);
  });

  it("persists production draft autosave in secure storage", () => {
    vi.stubEnv("APP_VARIANT", "production");

    expect(
      saveDraft("session-prod", {
        subjective: "PHI draft",
        objective: "",
        assessment: "",
        plan: "",
      }),
    ).toBe(true);
    expect(getDraft("session-prod")).toEqual({
      subjective: "PHI draft",
      objective: "",
      assessment: "",
      plan: "",
    });
  });

  it("survives a module reload with production draft data intact", async () => {
    vi.stubEnv("APP_VARIANT", "production");

    saveDraft("session-prod", {
      subjective: "Recovered after reload",
      objective: "Still present",
      assessment: "Stable",
      plan: "Continue",
    });

    vi.resetModules();
    const reloadedStore = await import("../../features/offline/storage/queueStore.js");

    expect(reloadedStore.getDraft("session-prod")).toEqual({
      subjective: "Recovered after reload",
      objective: "Still present",
      assessment: "Stable",
      plan: "Continue",
    });
  });

  it("stores oversized production drafts across secure-store chunks and reloads them intact", async () => {
    vi.stubEnv("APP_VARIANT", "production");

    const oversizedDraft = {
      subjective: "S".repeat(2600),
      objective: "O".repeat(2600),
      assessment: "A".repeat(2600),
      plan: "P".repeat(2600),
    };

    saveDraft("session-large", oversizedDraft);

    const version = SecureStore.getItem("physio.offline.draft.session-large.version");
    expect(version).toBeTruthy();
    expect(
      SecureStore.getItem(`physio.offline.draft.session-large.${version}.chunkCount`),
    ).toBeTruthy();
    expect(
      SecureStore.getItem(`physio.offline.draft.session-large.${version}.chunk.0`),
    ).toBeTruthy();
    expect(
      SecureStore.getItem(`physio.offline.draft.session-large.${version}.chunk.1`),
    ).toBeTruthy();

    vi.resetModules();
    const reloadedStore = await import("../../features/offline/storage/queueStore.js");

    expect(reloadedStore.getDraft("session-large")).toEqual(oversizedDraft);
  });

  it("preserves the previous draft when an oversized secure-store rewrite fails mid-write", () => {
    vi.stubEnv("APP_VARIANT", "production");

    const initialDraft = {
      subjective: "S".repeat(2600),
      objective: "O".repeat(2600),
      assessment: "A".repeat(2600),
      plan: "P".repeat(2600),
    };
    const replacementDraft = {
      subjective: "N".repeat(2600),
      objective: "E".repeat(2600),
      assessment: "W".repeat(2600),
      plan: "D".repeat(2600),
    };

    saveDraft("session-large", initialDraft);

    const originalSetItem = vi.mocked(SecureStore.setItem).getMockImplementation();
    let writeCount = 0;
    vi.mocked(SecureStore.setItem).mockImplementation((key: string, value: string) => {
      writeCount += 1;
      if (writeCount === 3) {
        throw new Error("simulated secure-store failure");
      }
      originalSetItem?.(key, value);
    });

    expect(() => saveDraft("session-large", replacementDraft)).toThrow(
      /Offline storage is unavailable/,
    );
    expect(getDraft("session-large")).toEqual(initialDraft);
  });

  it("clears stored production queue and drafts during offline PHI cleanup", () => {
    vi.stubEnv("APP_VARIANT", "production");

    saveQueuedChange({
      id: "prod-offline-2",
      type: "noteEdit" as const,
      sessionId: "session-prod",
      patientId: "patient-prod",
      sections: {
        subjective: "PHI draft",
        objective: "",
        assessment: "",
        plan: "",
      },
      timestamp: 2,
    });
    saveDraft("session-prod", {
      subjective: "Stored draft",
      objective: "",
      assessment: "",
      plan: "",
    });

    clearOfflinePhiData();

    expect(getQueuedChanges()).toHaveLength(0);
    expect(getDraft("session-prod")).toBeNull();
  });

  it("removes oversized draft chunks during offline PHI cleanup", () => {
    vi.stubEnv("APP_VARIANT", "production");

    saveDraft("session-large", {
      subjective: "S".repeat(2600),
      objective: "O".repeat(2600),
      assessment: "A".repeat(2600),
      plan: "P".repeat(2600),
    });

    const version = SecureStore.getItem("physio.offline.draft.session-large.version");
    expect(version).toBeTruthy();
    expect(
      SecureStore.getItem(`physio.offline.draft.session-large.${version}.chunkCount`),
    ).toBeTruthy();

    clearOfflinePhiData();

    expect(SecureStore.getItem("physio.offline.draft.session-large.version")).toBe(
      "__deleted__",
    );
    expect(
      SecureStore.getItem(`physio.offline.draft.session-large.${version}.chunkCount`),
    ).toBeNull();
    expect(
      SecureStore.getItem(`physio.offline.draft.session-large.${version}.chunk.0`),
    ).toBeNull();
    expect(
      SecureStore.getItem(`physio.offline.draft.session-large.${version}.chunk.1`),
    ).toBeNull();
    expect(getDraft("session-large")).toBeNull();
  });
});
