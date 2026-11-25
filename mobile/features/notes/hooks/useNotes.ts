import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CreateManualNoteRequest,
  SaveManualNoteRequest,
  TemplateCategory,
} from "../../../../shared/contracts/notes";
import { useAuth } from "../../auth/providers/AuthProvider";
import {
  patientTimelineQueryKey,
} from "../../patients/hooks/usePatients";
import { notesApi } from "../api/notesApi";
import type { CustomTemplateDto } from "../api/notesApi";

type NoteMutationInput = {
  patientId: string;
  sessionId: string;
};

type CreateManualNoteMutationInput = {
  patientId: string;
  input: CreateManualNoteRequest;
};

type SaveManualNoteMutationInput = {
  patientId: string;
  sessionId: string;
  input: SaveManualNoteRequest;
};

type ConditionTemplateFilters = {
  category?: TemplateCategory;
  query?: string;
  patientId?: string;
  limit?: number;
};

function normalizeId(value?: string): string {
  return value?.trim() ?? "";
}

function shouldEnableNoteQuery(
  status: ReturnType<typeof useAuth>["status"],
  patientId?: string,
  sessionId?: string,
): boolean {
  return (
    status === "authenticated" &&
    Boolean(normalizeId(patientId)) &&
    Boolean(normalizeId(sessionId))
  );
}

export function noteDetailQueryKey(patientId: string, sessionId: string) {
  return ["notes", "detail", patientId, sessionId] as const;
}

export function conditionTemplatesQueryKey() {
  return ["notes", "templates"] as const;
}
export function customTemplatesQueryKey() {
  return ["notes", "custom-templates"] as const;
}
export function templateCategoriesQueryKey() {
  return ["notes", "template-categories"] as const;
}

function normalizeTemplateFilters(
  filters: ConditionTemplateFilters = {},
): ConditionTemplateFilters {
  const query = normalizeId(filters.query);
  const patientId = normalizeId(filters.patientId);

  return {
    ...(filters.category ? { category: filters.category } : {}),
    ...(query ? { query } : {}),
    ...(patientId ? { patientId } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
  };
}

export function conditionTemplatesQueryKeyForFilters(
  filters: ConditionTemplateFilters = {},
) {
  return [
    "notes",
    "templates",
    {
      category: filters.category ?? "",
      query: normalizeId(filters.query),
      patientId: normalizeId(filters.patientId),
      ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
    },
  ] as const;
}

export function useManualNote(patientId?: string, sessionId?: string) {
  const { status, runProtectedAction } = useAuth();
  const normalizedPatientId = normalizeId(patientId);
  const normalizedSessionId = normalizeId(sessionId);

  return useQuery({
    queryKey: noteDetailQueryKey(normalizedPatientId, normalizedSessionId),
    enabled: shouldEnableNoteQuery(status, patientId, sessionId),
    queryFn: () =>
      runProtectedAction((accessToken) =>
        notesApi.getManualNote(accessToken, normalizedPatientId, normalizedSessionId),
      ),
  });
}

export function useConditionTemplates(filters: ConditionTemplateFilters = {}) {
  const { status, runProtectedAction } = useAuth();
  const normalizedFilters = normalizeTemplateFilters(filters);
  const normalizedPatientId = normalizeId(filters.patientId);
  const shouldEnableQuery =
    status === "authenticated" &&
    (filters.patientId === undefined || normalizedPatientId.length > 0);

  return useQuery({
    queryKey: conditionTemplatesQueryKeyForFilters(filters),
    enabled: shouldEnableQuery,
    queryFn: () =>
      runProtectedAction((accessToken) =>
        notesApi.listConditionTemplates(accessToken, normalizedFilters),
      ),
  });
}

export function useCustomTemplates(filters: ConditionTemplateFilters = {}) {
  const { status, runProtectedAction } = useAuth();
  const normalizedFilters = normalizeTemplateFilters(filters);
  return useQuery({
    queryKey: ["notes", "custom-templates", normalizedFilters] as const,
    enabled: status === "authenticated",
    queryFn: () =>
      runProtectedAction((accessToken) => notesApi.listCustomTemplates(accessToken, normalizedFilters)),
  });
}

export function useTemplateCategories() {
  const { status, runProtectedAction } = useAuth();
  return useQuery({
    queryKey: templateCategoriesQueryKey(),
    enabled: status === "authenticated",
    queryFn: () => runProtectedAction((accessToken) => notesApi.listTemplateCategories(accessToken)),
  });
}

export function useCreateManualNote() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ patientId, input }: CreateManualNoteMutationInput) =>
      runProtectedAction((accessToken) =>
        notesApi.createManualNote(accessToken, patientId, input),
      ),
    onSuccess: async (createdNote) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: noteDetailQueryKey(createdNote.patientId, createdNote.sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: patientTimelineQueryKey(createdNote.patientId),
        }),
      ]);
    },
  });

  return {
    ...mutation,
    createManualNote: mutation.mutateAsync,
  };
}

export function useSaveManualNote() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ patientId, sessionId, input }: SaveManualNoteMutationInput) =>
      runProtectedAction((accessToken) =>
        notesApi.saveManualNote(accessToken, patientId, sessionId, input),
      ),
    onSuccess: async (savedNote) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: noteDetailQueryKey(savedNote.patientId, savedNote.sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: patientTimelineQueryKey(savedNote.patientId),
        }),
      ]);
    },
  });

  return {
    ...mutation,
    saveManualNote: mutation.mutateAsync,
  };
}

export function useFinalizeManualNote() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ patientId, sessionId }: NoteMutationInput) =>
      runProtectedAction((accessToken) =>
        notesApi.finalizeManualNote(accessToken, patientId, sessionId),
      ),
    onSuccess: async (updatedNote) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: noteDetailQueryKey(updatedNote.patientId, updatedNote.sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: patientTimelineQueryKey(updatedNote.patientId),
        }),
      ]);
    },
  });

  return {
    ...mutation,
    finalizeManualNote: mutation.mutateAsync,
  };
}

export function useReopenManualNote() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ patientId, sessionId }: NoteMutationInput) =>
      runProtectedAction((accessToken) =>
        notesApi.reopenManualNote(accessToken, patientId, sessionId),
      ),
    onSuccess: async (updatedNote) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: noteDetailQueryKey(updatedNote.patientId, updatedNote.sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: patientTimelineQueryKey(updatedNote.patientId),
        }),
      ]);
    },
  });

  return {
    ...mutation,
    reopenManualNote: mutation.mutateAsync,
  };
}

export function useCreateCustomTemplate() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: Pick<CustomTemplateDto, "name" | "categories" | "sections">) =>
      runProtectedAction((accessToken) => notesApi.createCustomTemplate(accessToken, input)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conditionTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: customTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: templateCategoriesQueryKey() }),
      ]);
    },
  });
  return { ...mutation, createCustomTemplate: mutation.mutateAsync };
}

export function useUpdateCustomTemplate() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ templateId, input }: { templateId: string; input: Partial<Pick<CustomTemplateDto, "name" | "categories" | "sections">> }) =>
      runProtectedAction((accessToken) => notesApi.updateCustomTemplate(accessToken, templateId, input)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conditionTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: customTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: templateCategoriesQueryKey() }),
      ]);
    },
  });
  return { ...mutation, updateCustomTemplate: mutation.mutateAsync };
}

export function useDeleteCustomTemplate() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ templateId }: { templateId: string }) =>
      runProtectedAction((accessToken) => notesApi.deleteCustomTemplate(accessToken, templateId)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conditionTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: customTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: templateCategoriesQueryKey() }),
      ]);
    },
  });
  return { ...mutation, deleteCustomTemplate: mutation.mutateAsync };
}

export function useCreateTemplateCategory() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ label }: { label: TemplateCategory }) =>
      runProtectedAction((accessToken) => notesApi.createTemplateCategory(accessToken, label)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conditionTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: customTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: templateCategoriesQueryKey() }),
      ]);
    },
  });
  return { ...mutation, createTemplateCategory: mutation.mutateAsync };
}

export function useRenameTemplateCategory() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ categoryId, label }: { categoryId: string; label: TemplateCategory }) =>
      runProtectedAction((accessToken) => notesApi.renameTemplateCategory(accessToken, categoryId, label)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conditionTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: customTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: templateCategoriesQueryKey() }),
      ]);
    },
  });
  return { ...mutation, renameTemplateCategory: mutation.mutateAsync };
}

export function useDeleteTemplateCategory() {
  const { runProtectedAction } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ categoryId }: { categoryId: string }) =>
      runProtectedAction((accessToken) => notesApi.deleteTemplateCategory(accessToken, categoryId)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: conditionTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: customTemplatesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: templateCategoriesQueryKey() }),
      ]);
    },
  });
  return { ...mutation, deleteTemplateCategory: mutation.mutateAsync };
}
