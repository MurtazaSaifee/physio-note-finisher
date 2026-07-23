type ConnectivityListener = (isConnected: boolean) => void;

let listeners: ConnectivityListener[] = [];
export let isOnline = true;
let unsubscribeNetInfo: (() => void) | null = null;
let initialized = false;

export function addEventListener(listener: ConnectivityListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function removeEventListener(listener: ConnectivityListener): void {
  listeners = listeners.filter((l) => l !== listener);
}

/** @deprecated Use addEventListener instead */
export function addConnectivityListener(listener: ConnectivityListener): () => void {
  return addEventListener(listener);
}

function notifyListeners(connected: boolean): void {
  listeners.forEach((l) => l(connected));
}

export function setConnectivityState(connected: boolean): void {
  isOnline = connected;
  notifyListeners(connected);
}

export function getConnectivityState(): boolean {
  return isOnline;
}

async function initializeConnectivity(): Promise<void> {
  if (initialized || process.env.NODE_ENV === "test") {
    return;
  }

  initialized = true;

  try {
    const { default: NetInfo } = await import("@react-native-community/netinfo");
    const state = await NetInfo.fetch();
    isOnline = state.isConnected ?? false;

    unsubscribeNetInfo = NetInfo.addEventListener((nextState) => {
      const connected = nextState.isConnected ?? false;
      if (connected !== isOnline) {
        isOnline = connected;
        notifyListeners(connected);
      }
    });
  } catch {
    initialized = false;
  }
}

if (process.env.NODE_ENV !== "test") {
  void initializeConnectivity();
}

/** Cleanup helper for testing / hot-reload scenarios */
export function cleanupConnectivity(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
}
