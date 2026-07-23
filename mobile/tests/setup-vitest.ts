import { vi } from "vitest";

vi.stubGlobal("__DEV__", true);
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: null,
  },
}));
vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => `test-uuid-${Math.random()}`),
}));
vi.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    async deleteItemAsync(key: string) {
      values.delete(key);
    },
  };
});
