import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { SyncState, SyncStatus } from "../../../../shared/contracts/offline";
import { useAuth } from "../../auth/providers/AuthProvider";
import { getQueuedChanges, subscribeQueueChanges } from "../storage/queueStore";
import {
  getSyncState,
  startSyncReplay,
  type SyncApis,
} from "../services/syncService";
import {
  addEventListener,
  getConnectivityState,
} from "../services/connectivity";

export function useSyncStatus(apis?: SyncApis) {
  const { runProtectedAction } = useAuth();
  const [state, setState] = useState<SyncState & { isOnline: boolean }>(() => {
    const syncState = getSyncState();
    const queue = getQueuedChanges();
    return {
      ...syncState,
      pendingCount: queue.length,
      isOnline: getConnectivityState(),
    };
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const refreshState = useCallback(() => {
    const syncState = getSyncState();
    const queue = getQueuedChanges();
    setState({
      ...syncState,
      pendingCount: queue.length,
      isOnline: getConnectivityState(),
    });
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  const clearToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshState, 2000);
    return () => clearInterval(interval);
  }, [refreshState]);

  useEffect(() => {
    const unsubscribe = addEventListener((isConnected) => {
      setState((prev) => ({ ...prev, isOnline: isConnected }));
      if (isConnected && getQueuedChanges().length > 0) {
        void startSyncReplay({
          runAuthenticatedRequest: runProtectedAction,
          apis: apis ?? {},
          onToast: showToast,
        }).then(() => {
          refreshState();
        });
      }
    });
    return unsubscribe;
  }, [runProtectedAction, refreshState, apis, showToast]);

  const triggerReplay = useCallback(async () => {
    await startSyncReplay({
      runAuthenticatedRequest: runProtectedAction,
      apis: apis ?? {},
      onToast: showToast,
    });
    refreshState();
  }, [runProtectedAction, refreshState, apis, showToast]);

  return {
    state,
    triggerReplay,
    toastMessage,
    clearToast,
  };
}

export function useItemSyncStatus(itemId: string): SyncStatus {
  const getStatusSnapshot = useCallback((): SyncStatus => {
    const queue = getQueuedChanges();
    const hasPending = queue.some((item) => {
      if (item.type === "noteEdit") {
        return item.sessionId === itemId;
      }
      if (item.type === "appointmentEdit") {
        return item.appointmentId === itemId;
      }
      return false;
    });
    return hasPending ? "pending" : "synced";
  }, [itemId]);

  return useSyncExternalStore(subscribeQueueChanges, getStatusSnapshot, getStatusSnapshot);
}
