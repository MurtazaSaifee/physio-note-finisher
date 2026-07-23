import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { QueuedChange } from "../../../../shared/contracts/offline";
import type { SoapSections } from "../../../../shared/contracts/notes";

const QUEUE_KEY = "physio.offline.queue";
const DEAD_LETTER_QUEUE_KEY = "physio.offline.deadLetterQueue";
const DRAFT_INDEX_KEY = "physio.offline.draftIndex";
const DRAFT_KEY_PREFIX = "physio.offline.draft.";
const MAX_QUEUE_SIZE = 500;
const MAX_DEAD_LETTER_QUEUE_SIZE = 100;
const DEAD_LETTER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SECURE_STORE_CHUNK_SIZE = 1800;
const CHUNK_COUNT_SUFFIX = ".chunkCount";
const CHUNK_KEY_SUFFIX = ".chunk";
const VERSION_SUFFIX = ".version";
const DELETED_VERSION = "__deleted__";

type StorageAdapter = {
  setItem(key: string, value: string): void;
  getItem(key: string): string | null;
  deleteItem(key: string): void;
};

type MmkvLike = {
  set(key: string, value: string): void;
  getString(key: string): string | undefined;
  delete(key: string): void;
};

let explicitStore: StorageAdapter | null = null;

export type DeadLetterChange = {
  item: QueuedChange;
  error: string;
  failedAt: number;
};

function unavailableOfflineStoreError(): Error {
  return new Error("Offline storage is unavailable. Connect to the clinic server before saving.");
}

function chunkCountKey(key: string): string {
  return `${key}${CHUNK_COUNT_SUFFIX}`;
}

function chunkKey(key: string, index: number): string {
  return `${key}${CHUNK_KEY_SUFFIX}.${index}`;
}

function versionKey(key: string): string {
  return `${key}${VERSION_SUFFIX}`;
}

function scheduleSecureStoreDelete(key: string): void {
  void SecureStore.deleteItemAsync(key).catch(() => {
    // Best effort cleanup.
  });
}

function deleteChunkedValue(key: string): void {
  const countRaw = SecureStore.getItem(chunkCountKey(key));
  const count = countRaw ? Number.parseInt(countRaw, 10) : 0;

  if (Number.isFinite(count) && count > 0) {
    for (let index = 0; index < count; index += 1) {
      const keyToDelete = chunkKey(key, index);
      SecureStore.setItem(keyToDelete, "");
      scheduleSecureStoreDelete(keyToDelete);
    }
  }

  SecureStore.setItem(chunkCountKey(key), "0");
  SecureStore.setItem(key, "");
  scheduleSecureStoreDelete(chunkCountKey(key));
  scheduleSecureStoreDelete(key);
}

function getVersionedSecureStoreValue(key: string, version: string): string | null {
  const versionedKey = `${key}.${version}`;
  const countRaw = SecureStore.getItem(chunkCountKey(versionedKey));
  const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
  if (!Number.isFinite(count) || count < 1) {
    return null;
  }

  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const part = SecureStore.getItem(chunkKey(versionedKey, index));
    if (part === null) {
      return null;
    }
    parts.push(part);
  }

  return parts.join("");
}

function getSecureStoreValue(key: string): string | null {
  const version = SecureStore.getItem(versionKey(key));
  if (version === DELETED_VERSION) {
    return null;
  }
  if (version) {
    return getVersionedSecureStoreValue(key, version);
  }

  const countRaw = SecureStore.getItem(chunkCountKey(key));
  if (!countRaw) {
    return SecureStore.getItem(key);
  }

  const count = Number.parseInt(countRaw, 10);
  if (!Number.isFinite(count) || count < 1) {
    return SecureStore.getItem(key);
  }

  if (count === 1) {
    return SecureStore.getItem(key);
  }

  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const part = SecureStore.getItem(chunkKey(key, index));
    if (part === null) {
      return null;
    }
    parts.push(part);
  }

  return parts.join("");
}

function deleteSecureStoreValue(key: string): void {
  const version = SecureStore.getItem(versionKey(key));
  if (version && version !== DELETED_VERSION) {
    deleteChunkedValue(`${key}.${version}`);
  }

  SecureStore.setItem(versionKey(key), DELETED_VERSION);

  deleteChunkedValue(key);
}

function setSecureStoreValue(key: string, value: string): void {
  const previousVersion = SecureStore.getItem(versionKey(key));
  let nextVersion = randomUUID();
  while (nextVersion === previousVersion || nextVersion === DELETED_VERSION) {
    nextVersion = `${nextVersion}.next`;
  }
  const versionedKey = `${key}.${nextVersion}`;
  const chunkCount = Math.ceil(value.length / SECURE_STORE_CHUNK_SIZE);
  SecureStore.setItem(chunkCountKey(versionedKey), String(chunkCount));
  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * SECURE_STORE_CHUNK_SIZE;
    const end = start + SECURE_STORE_CHUNK_SIZE;
    SecureStore.setItem(chunkKey(versionedKey, index), value.slice(start, end));
  }
  SecureStore.setItem(versionKey(key), nextVersion);

  if (previousVersion) {
    deleteChunkedValue(`${key}.${previousVersion}`);
  }

  deleteChunkedValue(key);
}

const secureStoreAdapter: StorageAdapter = {
  setItem(key, value) {
    try {
      setSecureStoreValue(key, value);
    } catch {
      throw unavailableOfflineStoreError();
    }
  },
  getItem(key) {
    try {
      return getSecureStoreValue(key);
    } catch {
      return null;
    }
  },
  deleteItem(key) {
    try {
      deleteSecureStoreValue(key);
    } catch {
      // Best effort cleanup.
    }
  },
};

function getPrimaryStore(): StorageAdapter {
  return explicitStore ?? secureStoreAdapter;
}

function getReadableStores(): StorageAdapter[] {
  return explicitStore ? [explicitStore, secureStoreAdapter] : [secureStoreAdapter];
}

function getClearableStores(): StorageAdapter[] {
  return explicitStore ? [explicitStore, secureStoreAdapter] : [secureStoreAdapter];
}

function readStoredString(key: string): string | null {
  for (const store of getReadableStores()) {
    const value = store.getItem(key);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function writeStoredString(key: string, value: string): void {
  getPrimaryStore().setItem(key, value);
}

function deleteStoredString(key: string): void {
  for (const store of getClearableStores()) {
    store.deleteItem(key);
  }
}

function createId(): string {
  return randomUUID();
}

function readJsonArray<T>(key: string): T[] {
  const raw = readStoredString(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readJsonArrayFromStore<T>(store: StorageAdapter, key: string): T[] {
  const raw = store.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readQueue(): QueuedChange[] {
  return readJsonArray<QueuedChange>(QUEUE_KEY);
}

function writeQueue(queue: QueuedChange[]): void {
  writeStoredString(QUEUE_KEY, JSON.stringify(queue));
}

function readDeadLetterQueue(): DeadLetterChange[] {
  const cutoff = Date.now() - DEAD_LETTER_RETENTION_MS;
  return readJsonArray<DeadLetterChange>(DEAD_LETTER_QUEUE_KEY).filter(
    (entry) => entry.failedAt >= cutoff,
  );
}

function writeDeadLetterQueue(queue: DeadLetterChange[]): void {
  writeStoredString(DEAD_LETTER_QUEUE_KEY, JSON.stringify(queue));
}

function readDraftIndex(): string[] {
  return readJsonArray<string>(DRAFT_INDEX_KEY);
}

function writeDraftIndex(keys: string[]): void {
  writeStoredString(DRAFT_INDEX_KEY, JSON.stringify(Array.from(new Set(keys))));
}

function addDraftKey(key: string): void {
  writeDraftIndex([...readDraftIndex(), key]);
}

function removeDraftKey(key: string): void {
  writeDraftIndex(readDraftIndex().filter((item) => item !== key));
}

let queueChangeListeners: (() => void)[] = [];

export function subscribeQueueChanges(cb: () => void): () => void {
  queueChangeListeners.push(cb);
  return () => {
    queueChangeListeners = queueChangeListeners.filter((l) => l !== cb);
  };
}

function notifyQueueChanged(): void {
  queueChangeListeners.forEach((cb) => cb());
}

export function setMmkvImplementation(adapter: MmkvLike | null): void {
  explicitStore = adapter
    ? {
        setItem(key, value) {
          adapter.set(key, value);
        },
        getItem(key) {
          return adapter.getString(key) ?? null;
        },
        deleteItem(key) {
          adapter.delete(key);
        },
      }
    : null;
}

export function saveQueuedChange(change: QueuedChange): void {
  const queue = readQueue().filter((item) => item.id !== change.id);
  if (queue.length >= MAX_QUEUE_SIZE) {
    throw new Error("Offline queue is full. Please sync before making more changes.");
  }
  if (!change.id) {
    change = { ...change, id: createId() };
  }
  writeQueue([...queue, change]);
  notifyQueueChanged();
}

export function getQueuedChanges(): QueuedChange[] {
  return readQueue();
}

export function removeQueuedChange(id: string): void {
  writeQueue(readQueue().filter((item) => item.id !== id));
  notifyQueueChanged();
}

export function removeQueuedNoteEditsForSession(sessionId: string): void {
  writeQueue(
    readQueue().filter((item) => !(item.type === "noteEdit" && item.sessionId === sessionId)),
  );
  notifyQueueChanged();
}

export function saveDeadLetterChange(item: QueuedChange, error: string): void {
  const queue = readDeadLetterQueue().filter((entry) => entry.item.id !== item.id);
  queue.push({
    item,
    error,
    failedAt: Date.now(),
  });
  writeDeadLetterQueue(queue.slice(-MAX_DEAD_LETTER_QUEUE_SIZE));
  notifyQueueChanged();
}

export function getDeadLetterChanges(): DeadLetterChange[] {
  return readDeadLetterQueue();
}

export function clearDeadLetterQueue(): void {
  deleteStoredString(DEAD_LETTER_QUEUE_KEY);
  notifyQueueChanged();
}

export function clearQueue(): void {
  deleteStoredString(QUEUE_KEY);
  notifyQueueChanged();
}

export function clearOfflinePhiData(): void {
  const draftKeys = Array.from(
    new Set(
      getReadableStores().flatMap((store) =>
        readJsonArrayFromStore<string>(store, DRAFT_INDEX_KEY),
      ),
    ),
  );

  for (const key of draftKeys) {
    deleteStoredString(key);
  }
  deleteStoredString(QUEUE_KEY);
  deleteStoredString(DEAD_LETTER_QUEUE_KEY);
  deleteStoredString(DRAFT_INDEX_KEY);
  notifyQueueChanged();
}

export function saveDraft(sessionId: string, sections: SoapSections): boolean {
  const key = `${DRAFT_KEY_PREFIX}${sessionId}`;
  addDraftKey(key);
  writeStoredString(key, JSON.stringify(sections));
  return true;
}

export function getDraft(sessionId: string): SoapSections | null {
  const raw = readStoredString(`${DRAFT_KEY_PREFIX}${sessionId}`);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SoapSections;
  } catch {
    return null;
  }
}

export function findDraftByIdPrefix(
  draftIdPrefix: string,
): { draftId: string; sections: SoapSections } | null {
  const prefix = `${DRAFT_KEY_PREFIX}${draftIdPrefix}`;
  const matches = readDraftIndex().filter((key) => key.startsWith(prefix));
  for (const key of matches.reverse()) {
    const raw = readStoredString(key);
    if (!raw) {
      continue;
    }
    try {
      return {
        draftId: key.slice(DRAFT_KEY_PREFIX.length),
        sections: JSON.parse(raw) as SoapSections,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export function clearDraft(sessionId: string): void {
  const key = `${DRAFT_KEY_PREFIX}${sessionId}`;
  deleteStoredString(key);
  removeDraftKey(key);
}
