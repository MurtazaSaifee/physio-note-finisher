import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ConditionTemplateListResponse,
  CreateManualNoteRequest,
  ProgressNoteResponse,
  SaveManualNoteRequest,
} from "../../../shared/contracts/notes";
import { useAuth } from "../../features/auth/providers/AuthProvider";
import {
  notesApi,
  createNotesApi,
} from "../../features/notes/api/notesApi";
import {
  conditionTemplatesQueryKey,
  conditionTemplatesQueryKeyForFilters,
  noteDetailQueryKey,
  useConditionTemplates,
  useCreateManualNote,
  useFinalizeManualNote,
  useManualNote,
  useReopenManualNote,
  useSaveManualNote,
} from "../../features/notes/hooks/useNotes";
import { patientTimelineQueryKey } from "../../features/patients/hooks/usePatients";

vi.mock("../../features/auth/providers/AuthProvider.js", () => ({
  useAuth: vi.fn(),
}));

type JsonResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

const authState = {
  status: "authenticated" as const,
  runProtectedAction: async <T,>(
    request: (accessToken: string) => Promise<T>,
  ): Promise<T> => request("access-token"),
};

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

async function renderHook<T>(callback: () => T) {
  let latestResult: T | undefined;
  const queryClient = createQueryClient();

  function TestHarness(): React.JSX.Element {
    latestResult = callback();
    return <></>;
  }

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <TestHarness />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });

  if (!renderer) {
    throw new Error("Failed to create hook renderer");
  }

  return {
    get current(): T {
      if (latestResult === undefined) {
        throw new Error("Hook result not ready");
      }
      return latestResult;
    },
    queryClient,
    renderer,
    async flush(): Promise<void> {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    async cleanup(): Promise<void> {
      await act(async () => {
        renderer?.unmount();
      });
    },
  };
}

function createSequentialTransport(responses: unknown[]) {
  const calls: Array<{
    input: string;
    init: { method: string; headers: Record<string, string>; body?: string };
  }> = [];

  const transport = vi.fn(
    async (
      input: string,
      init: { method: "GET" | "POST" | "PUT"; headers: Record<string, string>; body?: string },
    ): Promise<JsonResponse> => {
      calls.push({ input, init });
      const payload = responses.shift();

      if (payload === undefined) {
        throw new Error("No queued response");
      }

      return {
        ok: true,
        status: 200,
        async json() {
          return payload;
        },
      };
    },
  );

  return { transport, calls };
}

const noteResponse: ProgressNoteResponse = {
  id: "note-1",
  patientId: "patient-1",
  sessionId: "session-1",
  startedAt: "2026-04-17T12:34:56.000Z",
  visitType: "follow-up",
  noteStatus: "draft",
  patientSummary: null,
  sections: {
    subjective: "Pain with stairs",
    objective: "Mild swelling",
    assessment: "Improving strength",
    plan: "Continue progressive loading",
  },
  templateKey: "knee",
  templateProvenance: {
    templateLabel: "Knee rehabilitation",
    categoryLabels: ["Knee", "Sports"],
    source: "custom",
    applyMode: "fillBlank",
  },
  createdAt: "2026-04-17T12:40:00.000Z",
  updatedAt: "2026-04-17T12:40:00.000Z",
};

const savedNoteResponse: ProgressNoteResponse = {
  ...noteResponse,
  sections: {
    subjective: "Pain with stairs",
    objective: "Improved knee extension",
    assessment: "Improving strength",
    plan: "Continue progressive loading",
  },
  updatedAt: "2026-04-17T12:41:00.000Z",
};

const finalizedNoteResponse: ProgressNoteResponse = {
  ...savedNoteResponse,
  noteStatus: "finalized",
  updatedAt: "2026-04-17T12:42:00.000Z",
};

const reopenedNoteResponse: ProgressNoteResponse = {
  ...savedNoteResponse,
  noteStatus: "reopened",
  updatedAt: "2026-04-17T12:43:00.000Z",
};

const templatesResponse: ConditionTemplateListResponse = {
  templates: [
    {
      key: "custom-template-1",
      label: "Knee rehabilitation",
      category: "Knee",
      categories: ["Knee", "Sports"],
      source: "custom",
      description: "Knee rehab scaffold",
      conditionTags: ["Knee", "Rehab"],
      sections: {
        subjective: "Pain, stiffness, and activity tolerance",
        objective: "ROM, strength, gait, swelling",
        assessment: "Clinical reasoning scaffold",
        plan: "Exercise progressions and next visit",
      },
    },
  ],
  suggestedTemplates: [],
  recentTemplates: [],
  categories: ["Knee", "Sports"],
};

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(authState);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notesApi and note hooks", () => {
  it("normalizes protected note and template envelopes with bearer auth", async () => {
    const { transport, calls } = createSequentialTransport([
      {
        success: true,
        data: noteResponse,
      },
      {
        success: true,
        data: {
          ...noteResponse,
          patientSummary: "Continue the agreed home exercises.",
        },
      },
      {
        success: true,
        data: savedNoteResponse,
      },
      {
        success: true,
        data: finalizedNoteResponse,
      },
      {
        success: true,
        data: reopenedNoteResponse,
      },
      {
        success: true,
        data: templatesResponse,
      },
    ]);

    const api = createNotesApi("https://api.example.com", transport);
    const createInput: CreateManualNoteRequest = {
      startedAt: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      sections: noteResponse.sections,
      templateKey: "knee",
    };
    const saveInput: SaveManualNoteRequest = {
      sections: savedNoteResponse.sections,
      templateKey: "knee",
    };

    const created = await api.createManualNote(
      "access-token",
      "patient-1",
      createInput,
    );
    const fetched = await api.getManualNote(
      "access-token",
      "patient-1",
      "session-1",
    );

    expect(fetched).toMatchObject({
      patientSummary: "Continue the agreed home exercises.",
    });
    const saved = await api.saveManualNote(
      "access-token",
      "patient-1",
      "session-1",
      saveInput,
    );
    const finalized = await api.finalizeManualNote(
      "access-token",
      "patient-1",
      "session-1",
    );
    const reopened = await api.reopenManualNote(
      "access-token",
      "patient-1",
      "session-1",
    );
    const templates = await api.listConditionTemplates("access-token");

    expect(calls).toHaveLength(6);
    expect(calls[0]?.input).toBe(
      "https://api.example.com/api/v1/patients/patient-1/manual-notes",
    );
    expect(calls[0]?.init.headers.authorization).toBe("Bearer access-token");
    expect(calls[1]?.input).toBe(
      "https://api.example.com/api/v1/patients/patient-1/sessions/session-1/note",
    );
    expect(calls[3]?.input).toBe(
      "https://api.example.com/api/v1/patients/patient-1/sessions/session-1/note/finalize",
    );
    expect(calls[5]?.input).toBe("https://api.example.com/api/v1/note-templates");
    expect(created.sections.subjective).toBe("Pain with stairs");
    expect(fetched.sessionId).toBe("session-1");
    expect(saved.sections.objective).toBe("Improved knee extension");
    expect(finalized.noteStatus).toBe("finalized");
    expect(reopened.noteStatus).toBe("reopened");
    expect(templates.templates[0]?.sections.plan).toBe(
      "Exercise progressions and next visit",
    );
    expect(created.templateProvenance?.templateLabel).toBe("Knee rehabilitation");
    expect(templates.templates[0]?.source).toBe("custom");
    expect(templates.templates[0]?.categories).toEqual(["Knee", "Sports"]);
  });

  it("rejects a note response whose patient summary is not nullable text", async () => {
    const { transport } = createSequentialTransport([
      {
        success: true,
        data: {
          ...noteResponse,
          patientSummary: 12,
        },
      },
    ]);
    const api = createNotesApi("https://api.example.com", transport);

    await expect(
      api.getManualNote("access-token", "patient-1", "session-1"),
    ).rejects.toThrow("Invalid notes response: patientSummary");
  });

  it("throws on malformed success envelopes", async () => {
    const { transport } = createSequentialTransport([
      {
        success: false,
        data: noteResponse,
      },
    ]);

    const api = createNotesApi("https://api.example.com", transport);

    await expect(
      api.getManualNote("access-token", "patient-1", "session-1"),
    ).rejects.toThrow("Invalid notes response");
  });

  it("keeps query keys stable and invalidates patient timeline after note mutations", async () => {
    expect(noteDetailQueryKey("patient-1", "session-1")).toEqual([
      "notes",
      "detail",
      "patient-1",
      "session-1",
    ]);
    expect(conditionTemplatesQueryKey()).toEqual(["notes", "templates"]);
    expect(conditionTemplatesQueryKeyForFilters()).toEqual([
      "notes",
      "templates",
      {
        category: "",
        query: "",
        patientId: "",
      },
    ]);

    const createSpy = vi
      .spyOn(notesApi, "createManualNote")
      .mockResolvedValue(noteResponse);
    const saveSpy = vi
      .spyOn(notesApi, "saveManualNote")
      .mockResolvedValue(savedNoteResponse);
    const finalizeSpy = vi
      .spyOn(notesApi, "finalizeManualNote")
      .mockResolvedValue(finalizedNoteResponse);
    const reopenSpy = vi
      .spyOn(notesApi, "reopenManualNote")
      .mockResolvedValue(reopenedNoteResponse);
    const getSpy = vi
      .spyOn(notesApi, "getManualNote")
      .mockResolvedValue(noteResponse);
    const listSpy = vi
      .spyOn(notesApi, "listConditionTemplates")
      .mockResolvedValue(templatesResponse);

    const manualNoteHook = await renderHook(() =>
      useManualNote("patient-1", "session-1"),
    );
    const templatesHook = await renderHook(() => useConditionTemplates());
    const createHook = await renderHook(() => useCreateManualNote());
    const saveHook = await renderHook(() => useSaveManualNote());
    const finalizeHook = await renderHook(() => useFinalizeManualNote());
    const reopenHook = await renderHook(() => useReopenManualNote());

    const invalidateCreateSpy = vi.spyOn(createHook.queryClient, "invalidateQueries");
    const invalidateSaveSpy = vi.spyOn(saveHook.queryClient, "invalidateQueries");
    const invalidateFinalizeSpy = vi.spyOn(
      finalizeHook.queryClient,
      "invalidateQueries",
    );
    const invalidateReopenSpy = vi.spyOn(reopenHook.queryClient, "invalidateQueries");

    await manualNoteHook.flush();
    await templatesHook.flush();

    await act(async () => {
      await createHook.current.createManualNote({
        patientId: "patient-1",
        input: {
          startedAt: "2026-04-17T12:34:56.000Z",
          visitType: "follow-up",
          sections: noteResponse.sections,
          templateKey: "knee",
        },
      });
    });

    await act(async () => {
      await saveHook.current.saveManualNote({
        patientId: "patient-1",
        sessionId: "session-1",
        input: {
          sections: savedNoteResponse.sections,
          templateKey: "knee",
        },
      });
    });

    await act(async () => {
      await finalizeHook.current.finalizeManualNote({
        patientId: "patient-1",
        sessionId: "session-1",
      });
    });

    await act(async () => {
      await reopenHook.current.reopenManualNote({
        patientId: "patient-1",
        sessionId: "session-1",
      });
    });

    expect(getSpy).toHaveBeenCalledWith(
      "access-token",
      "patient-1",
      "session-1",
    );
    expect(listSpy).toHaveBeenCalledWith("access-token", {});
    expect(createSpy).toHaveBeenCalledWith(
      "access-token",
      "patient-1",
      expect.objectContaining({
        templateKey: "knee",
      }),
    );
    expect(saveSpy).toHaveBeenCalledWith(
      "access-token",
      "patient-1",
      "session-1",
      expect.objectContaining({
        templateKey: "knee",
      }),
    );
    expect(finalizeSpy).toHaveBeenCalledWith(
      "access-token",
      "patient-1",
      "session-1",
    );
    expect(reopenSpy).toHaveBeenCalledWith(
      "access-token",
      "patient-1",
      "session-1",
    );
    expect(invalidateCreateSpy).toHaveBeenCalledWith({
      queryKey: noteDetailQueryKey("patient-1", "session-1"),
    });
    expect(invalidateCreateSpy).toHaveBeenCalledWith({
      queryKey: patientTimelineQueryKey("patient-1"),
    });
    expect(invalidateSaveSpy).toHaveBeenCalledWith({
      queryKey: noteDetailQueryKey("patient-1", "session-1"),
    });
    expect(invalidateFinalizeSpy).toHaveBeenCalledWith({
      queryKey: noteDetailQueryKey("patient-1", "session-1"),
    });
    expect(invalidateReopenSpy).toHaveBeenCalledWith({
      queryKey: noteDetailQueryKey("patient-1", "session-1"),
    });

    await manualNoteHook.cleanup();
    await templatesHook.cleanup();
    await createHook.cleanup();
    await saveHook.cleanup();
    await finalizeHook.cleanup();
    await reopenHook.cleanup();
  });
});
