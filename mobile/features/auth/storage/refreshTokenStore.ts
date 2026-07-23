export const REFRESH_TOKEN_STORAGE_KEY = "physio.auth.refresh_token";

export type SecureStoreLike = {
  setItemAsync(key: string, value: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  deleteItemAsync(key: string): Promise<void>;
};

const inMemoryStore = new Map<string, string>();

const inMemoryAdapter: SecureStoreLike = {
  async setItemAsync(key, value) {
    inMemoryStore.set(key, value);
  },
  async getItemAsync(key) {
    return inMemoryStore.get(key) ?? null;
  },
  async deleteItemAsync(key) {
    inMemoryStore.delete(key);
  },
};

let explicitAdapter: SecureStoreLike | null = null;

function getAdapter(): SecureStoreLike {
  if (explicitAdapter) {
    return explicitAdapter;
  }

  if (!__DEV__) {
    throw new Error(
      "SecureStore is not available. Refresh tokens cannot persist in production without a secure storage implementation.",
    );
  }

  // eslint-disable-next-line no-console
  console.warn(
    "[refreshTokenStore] SecureStore not initialized. Using in-memory fallback. Tokens will not persist across app restarts.",
  );

  return inMemoryAdapter;
}

export function setSecureStoreImplementation(
  secureStore: SecureStoreLike,
): void {
  explicitAdapter = secureStore;
}

export function isSecureStoreAvailable(): boolean {
  return explicitAdapter !== null;
}

export async function saveRefreshToken(token: string): Promise<void> {
  await getAdapter().setItemAsync(REFRESH_TOKEN_STORAGE_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return getAdapter().getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  await getAdapter().deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
}
