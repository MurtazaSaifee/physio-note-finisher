import { afterEach, describe, expect, it, vi } from "vitest";

const { mockedExpoConfig } = vi.hoisted(() => ({
  mockedExpoConfig: {
    hostUri: "127.0.0.1:8081",
  },
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: mockedExpoConfig,
  },
}));

import { describeBackendConnection, resolveApiBaseUrl } from "../../features/runtime/apiBaseUrl";

describe("resolveApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockedExpoConfig.hostUri = "127.0.0.1:8081";
  });

  it("prefers an explicit environment override", () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://192.168.1.10:3000/");

    expect(resolveApiBaseUrl()).toBe("http://192.168.1.10:3000");
  });

  it("rewrites localhost override to Expo LAN host on Android devices", () => {
    vi.stubEnv("EXPO_OS", "android");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://localhost:3000");
    mockedExpoConfig.hostUri = "192.168.1.14:8081";

    expect(resolveApiBaseUrl()).toBe("http://192.168.1.14:3000");
  });

  it("maps localhost hostUri to the Android emulator host", () => {
    vi.stubEnv("EXPO_OS", "android");
    mockedExpoConfig.hostUri = "localhost:8081";

    expect(resolveApiBaseUrl()).toBe("http://10.0.2.2:3000");
  });

  it("keeps a real LAN hostUri unchanged", () => {
    vi.stubEnv("EXPO_OS", "android");
    mockedExpoConfig.hostUri = "192.168.1.14:8081";

    expect(resolveApiBaseUrl()).toBe("http://192.168.1.14:3000");
  });
});

describe("describeBackendConnection", () => {
  it("describes private network hosts as local backends", () => {
    expect(describeBackendConnection("http://10.0.2.2:3000")).toBe("local backend");
  });

  it("describes staging hosts as staging backends", () => {
    expect(describeBackendConnection("https://staging-api.example.com")).toBe(
      "staging backend",
    );
  });

  it("falls back to the hostname for other backends", () => {
    expect(describeBackendConnection("https://api.example.com")).toBe(
      "api.example.com backend",
    );
  });
});
