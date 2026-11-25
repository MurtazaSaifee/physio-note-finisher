import type { QueuedChange, SyncState } from "../../../../shared/contracts/offline";
import type {
  CreateManualNoteRequest,
  SaveManualNoteRequest,
} from "../../../../shared/contracts/notes";
import type { UpdateAppointmentRequest } from "../../../../shared/contracts/appointments";
import {
  clearDraft,
  getDeadLetterChanges,
  getQueuedChanges,
  removeQueuedChange,
  saveDeadLetterChange,
} from "../storage/queueStore";

export { getDeadLetterChanges } from "../storage/queueStore";

const RETRY_DELAYS_MS = [5000, 15000, 45000] as const;
const MAX_RETRIES = 3;

export type SyncApis = {
  createManualNote?: (
    accessToken: string,
    patientId: string,
    input: CreateManualNoteRequest,
  ) => Promise<{ sessionId: string } | unknown>;
  saveManualNote?: (
    accessToken: string,
    patientId: string,
    sessionId: string,
    input: SaveManualNoteRequest,
  ) => Promise<unknown>;
  updateAppointment?: (
    accessToken: string,
    appointmentId: string,
    input: UpdateAppointmentRequest,
  ) => Promise<unknown>;
};

export type SyncServiceConfig = {
  runAuthenticatedRequest: <T>(request: (accessToken: string) => Promise<T>) => Promise<T>;
  apis: SyncApis;
  onStateChange?: (state: SyncState) => void;
  onToast?: (message: string) => void;
};

let currentSyncState: SyncState = {
  status: "idle",
  pendingCount: 0,
};
let activeReplayPromise: Promise<void> | null = null;

function setSyncState(next: Partial<SyncState>): void {
  const updated: SyncState = { ...currentSyncState };
  if (next.status !== undefined) updated.status = next.status;
  if (next.pendingCount !== undefined) updated.pendingCount = next.pendingCount;
  if ("currentItem" in next) updated.currentItem = next.currentItem;
  if ("totalItems" in next) updated.totalItems = next.totalItems;
  if ("lastError" in next) updated.lastError = next.lastError;
  currentSyncState = updated;
}

export function getSyncState(): SyncState {
  return { ...currentSyncState };
}

export function resetSyncState(): void {
  currentSyncState = { status: "idle", pendingCount: 0 };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replayItem(
  item: QueuedChange,
  config: SyncServiceConfig,
): Promise<void> {
  const { runAuthenticatedRequest, apis } = config;

  if (item.type === "noteCreate") {
    if (!apis.createManualNote) {
      throw new Error("createManualNote API not provided");
    }
    await runAuthenticatedRequest((accessToken) =>
      apis.createManualNote!(accessToken, item.patientId, item.input),
    );
    clearDraft(item.draftId);
  } else if (item.type === "noteEdit") {
    if (!apis.saveManualNote) {
      throw new Error("saveManualNote API not provided");
    }
    const input: SaveManualNoteRequest = {
      sections: item.sections,
    };
    await runAuthenticatedRequest((accessToken) =>
      apis.saveManualNote!(accessToken, item.patientId, item.sessionId, input),
    );
  } else if (item.type === "appointmentEdit") {
    if (!apis.updateAppointment) {
      throw new Error("updateAppointment API not provided");
    }
    await runAuthenticatedRequest((accessToken) =>
      apis.updateAppointment!(accessToken, item.appointmentId, item.updates),
    );
  }
}

async function replayWithRetry(
  item: QueuedChange,
  config: SyncServiceConfig,
): Promise<{ success: boolean; error?: string }> {
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await replayItem(item, config);
      return { success: true };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (isPermanentError(lastError)) {
        return { success: false, error: lastError };
      }
      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_DELAYS_MS[attempt];
        if (delayMs !== undefined) {
          await delay(delayMs);
        }
      }
    }
  }

  return { success: false, error: lastError };
}

function isPermanentError(error: string | undefined): boolean {
  if (!error) return false;
  // 4xx client errors (except 408/429 which are retryable)
  const match = error.match(/\b4(\d{2})\b/);
  if (match) {
    const code = parseInt(match[1] ?? "0", 10);
    return code !== 8 && code !== 29; // 408 and 429 are retryable
  }
  return false;
}

async function runSyncReplay(config: SyncServiceConfig): Promise<void> {
  const queue = getQueuedChanges();

  if (queue.length === 0) {
    const next: SyncState = {
      status: "idle",
      pendingCount: 0,
    };
    currentSyncState = next;
    return;
  }

  setSyncState({
    status: "syncing",
    pendingCount: queue.length,
    totalItems: queue.length,
    currentItem: 1,
  });

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (!item) continue;

    setSyncState({ currentItem: i + 1 });

    const result = await replayWithRetry(item, config);

    if (result.success) {
      removeQueuedChange(item.id);
    } else if (isPermanentError(result.error)) {
      saveDeadLetterChange(item, result.error ?? "Permanent sync failure");
      removeQueuedChange(item.id);
    } else {
      setSyncState({
        status: "failed",
        lastError: result.error ?? "Unknown error",
      });
      if (config.onToast) {
        config.onToast("Sync failed — retrying in 30s");
      }
      return;
    }
  }

  const remaining = getQueuedChanges().length;
  const deadLetters = getDeadLetterChanges().length;
  const next: SyncState = {
    status: remaining > 0 || deadLetters > 0 ? "failed" : "idle",
    pendingCount: remaining,
    ...(deadLetters > 0
      ? {
          lastError: `${deadLetters} item${deadLetters === 1 ? "" : "s"} needs manual review before it can sync.`,
        }
      : {}),
  };
  currentSyncState = next;
}

export async function startSyncReplay(config: SyncServiceConfig): Promise<void> {
  if (activeReplayPromise) {
    return activeReplayPromise;
  }

  activeReplayPromise = runSyncReplay(config).finally(() => {
    activeReplayPromise = null;
  });

  return activeReplayPromise;
}
