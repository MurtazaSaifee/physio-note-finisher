import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedExpoConfig, reactNativeMocks } = vi.hoisted(() => ({
  mockedExpoConfig: {
    hostUri: "127.0.0.1:8081",
  },
  reactNativeMocks: {
    hardwareBackHandler: null as null | (() => boolean),
    hardwareBackHandlers: [] as Array<() => boolean>,
  },
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  Alert: { alert: vi.fn() },
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      reactNativeMocks.hardwareBackHandlers.push(handler);
      reactNativeMocks.hardwareBackHandler = handler;
      return {
        remove: () => {
          reactNativeMocks.hardwareBackHandlers = reactNativeMocks.hardwareBackHandlers.filter(
            (registeredHandler) => registeredHandler !== handler,
          );
          reactNativeMocks.hardwareBackHandler =
            reactNativeMocks.hardwareBackHandlers.at(-1) ?? null;
        },
      };
    },
  },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

const mockVoiceFixtureAsset = vi.hoisted(() => ({
  downloadAsync: vi.fn(async () => undefined),
  localUri: "file:///mock/staging-voice-fallback.m4a",
  uri: "asset://staging-voice-fallback.m4a",
}));

vi.mock("expo-asset", () => ({
  Asset: {
    fromModule: vi.fn(() => mockVoiceFixtureAsset),
  },
}));

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: {
    Base64: "base64",
  },
  readAsStringAsync: vi.fn(async () => "QUJD"),
  uploadAsync: vi.fn(async () => ({ status: 200 })),
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 1024 })),
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  makeDirectoryAsync: vi.fn(async () => undefined),
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: mockedExpoConfig,
  },
}));

vi.mock("lucide-react-native", () => ({
  Mic: "Mic",
  ChevronLeft: "ChevronLeft",
}));

const mockRecorder = vi.hoisted(() => ({
  prepareToRecordAsync: vi.fn(async () => {}),
  record: vi.fn(() => {}),
  stop: vi.fn(async () => {}),
  pause: vi.fn(() => {}),
  getStatus: vi.fn(() => ({
    canRecord: true,
    isRecording: mockRecorder.isRecording,
    durationMillis: mockAudioState.durationMillis,
    mediaServicesDidReset: false,
    url: mockRecorder.uri,
  })),
  uri: null as string | null,
  durationMillis: 0,
  isRecording: false,
  currentTime: 0,
}));

const mockAudioState = vi.hoisted(() => ({
  canRecord: true,
  isRecording: false,
  durationMillis: 0,
  url: null as string | null,
  mediaServicesDidReset: false,
}));

const mockPlaybackPlayer = vi.hoisted(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(async () => undefined),
}));

const mockPlaybackStatus = vi.hoisted(() => ({
  playing: false,
  playbackState: "ready",
  didJustFinish: false,
}));

vi.mock("expo-audio", () => {
  const useAudioRecorder = vi.fn(() => mockRecorder);
  const useAudioRecorderState = vi.fn(() => mockAudioState);
  const useAudioPlayer = vi.fn(() => mockPlaybackPlayer);
  const useAudioPlayerStatus = vi.fn(() => mockPlaybackStatus);
  return {
    AudioModule: {
      requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: true })),
    },
    requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: true })),
    useAudioRecorder,
    useAudioRecorderState,
    useAudioPlayer,
    useAudioPlayerStatus,
    __esModule: true,
  };
});

// Mock fetch for consent endpoint calls
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../features/auth/providers/AuthProvider", () => ({
  useAuth: () => ({
    runProtectedAction: async <T,>(fn: (accessToken: string) => Promise<T>) =>
      fn("access-token"),
  }),
}));

vi.mock("../../features/patients/hooks/usePatients", () => ({
  usePatientProfile: () => ({ data: null, isLoading: false }),
}));

import * as FileSystem from "expo-file-system/legacy";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { Alert, BackHandler } from "react-native";
import type { VoiceUploadCompleteResponse } from "../../../shared/contracts/voice";
import { VoiceCaptureScreen } from "../../features/voice/screens/VoiceCaptureScreen";

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(element);
  });

  if (!renderer) {
    throw new Error("Failed to render screen");
  }

  return renderer;
}

function findButton(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  const textNode = renderer.root.find(
    (node) =>
      node.type === "Text" &&
      node.children.some((child) => child === label),
  );
  let current: TestRenderer.ReactTestInstance | null = textNode;
  while (current && current.type !== "Pressable") {
    current = current.parent;
  }
  if (!current) {
    throw new Error(`Missing button ${label}`);
  }
  return current;
}

function hasText(
  renderer: TestRenderer.ReactTestRenderer,
  text: string,
): boolean {
  return renderer.root.findAll(
    (node) =>
      node.type === "Text" &&
      node.children.some((child) => child === text),
  ).length > 0;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function findFetchCall(
  predicate: (url: string, init?: RequestInit) => boolean,
): [RequestInfo | URL, RequestInit | undefined] | undefined {
  return mockFetch.mock.calls.find(([input, init]) => predicate(getRequestUrl(input), init));
}

function dispatchHardwareBack(): boolean {
  for (const handler of [...reactNativeMocks.hardwareBackHandlers].reverse()) {
    if (handler()) {
      return true;
    }
  }
  return false;
}

beforeEach(() => {
  reactNativeMocks.hardwareBackHandler = null;
  reactNativeMocks.hardwareBackHandlers = [];
  mockRecorder.uri = null;
  mockRecorder.durationMillis = 0;
  mockAudioState.url = null;
  mockAudioState.durationMillis = 0;
  mockPlaybackStatus.playing = false;
  mockPlaybackStatus.playbackState = "ready";
  mockPlaybackStatus.didJustFinish = false;
  mockVoiceFixtureAsset.localUri = "file:///mock/staging-voice-fallback.m4a";
  mockFetch.mockReset();
  vi.clearAllMocks();
  mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "PUT") {
      return new Response("", { status: 200 });
    }
    throw new Error(`Unexpected fetch call in test: ${method} ${url}`);
  });
});

describe("VoiceCaptureScreen", () => {
  it("preflights microphone permission when the screen opens", async () => {
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });

    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("exposes explicit ready, recording, and paused states", async () => {
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    expect(hasText(renderer, "Ready to record")).toBe(true);

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    expect(hasText(renderer, "Recording")).toBe(true);

    await act(async () => {
      findButton(renderer, "Pause").props.onPress();
    });
    expect(hasText(renderer, "Paused")).toBe(true);
  });

  it("keeps patient context and a safe back target visible during recording", async () => {
    const onBack = vi.fn();
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        patientName="Ada Lovelace"
        conditionLabel="spine"
        onBack={onBack}
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    expect(hasText(renderer, "Ada Lovelace")).toBe(true);
    expect(hasText(renderer, "spine")).toBe(true);
    expect(renderer.root.findByProps({ testID: "voice-capture-patient-context" })).toBeTruthy();

    const backButton = renderer.root.findByProps({ testID: "voice-capture-back-button" });
    await act(async () => {
      backButton.props.onPress();
    });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("confirms from the header and Android Back before discarding a local recording", async () => {
    const onBack = vi.fn();
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        onBack={onBack}
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "voice-capture-back-button" }).props.onPress();
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Discard recording?",
      expect.stringContaining("local recording"),
      expect.any(Array),
    );
    const headerButtons = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    headerButtons.find((button) => button.text === "Keep recording")?.onPress?.();
    expect(onBack).not.toHaveBeenCalled();
    expect(hasText(renderer, "Recording")).toBe(true);

    await act(async () => {
      expect(reactNativeMocks.hardwareBackHandler?.()).toBe(true);
    });
    const hardwareButtons = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      hardwareButtons.find((button) => button.text === "Discard recording")?.onPress?.();
    });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("keeps a paused recording when either back route is cancelled", async () => {
    const onBack = vi.fn();
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        onBack={onBack}
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );
    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Pause").props.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "voice-capture-back-button" }).props.onPress();
    });
    const headerButtons = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    headerButtons.find((button) => button.text === "Keep recording")?.onPress?.();
    expect(hasText(renderer, "Paused")).toBe(true);
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    const hardwareButtons = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    hardwareButtons.find((button) => button.text === "Keep recording")?.onPress?.();
    expect(hasText(renderer, "Paused")).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("keeps a stopped recording when either back route is cancelled", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;
    const onBack = vi.fn();
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        onBack={onBack}
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );
    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "voice-capture-back-button" }).props.onPress();
    });
    const headerButtons = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    headerButtons.find((button) => button.text === "Keep recording")?.onPress?.();
    expect(hasText(renderer, "Ready to process")).toBe(true);
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    const hardwareButtons = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    hardwareButtons.find((button) => button.text === "Keep recording")?.onPress?.();
    expect(hasText(renderer, "Ready to process")).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("lets the capture guard win over the app-shell Android Back listener", async () => {
    const onBack = vi.fn();
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        onBack={onBack}
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );
    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    const appShellBack = vi.fn(() => false);
    const appShellSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      appShellBack,
    );

    await act(async () => {
      expect(dispatchHardwareBack()).toBe(true);
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Discard recording?",
      expect.any(String),
      expect.any(Array),
    );
    expect(appShellBack).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
    appShellSubscription.remove();
  });

  it("blocks navigation during upload and ignores completion after the screen closes", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;
    let resolveComplete: ((value: VoiceUploadCompleteResponse) => void) | undefined;
    const completeUpload = vi.fn(
      () => new Promise<VoiceUploadCompleteResponse>((resolve) => {
        resolveComplete = resolve;
      }),
    );
    const onBack = vi.fn();
    const onUploadComplete = vi.fn();
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        onBack={onBack}
        uploadRecap={vi.fn(async () => ({
          uploadId: "upload-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          uploadUrl: "https://storage.example.com/upload-1",
          storageKey: "voice/upload-1/recap.m4a",
          expiresAt: "2026-07-18T00:00:00.000Z",
        }))}
        completeUpload={completeUpload}
        onUploadComplete={onUploadComplete}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Upload Recap").props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(completeUpload).toHaveBeenCalledOnce();

    await act(async () => {
      renderer.root.findByProps({ testID: "voice-capture-back-button" }).props.onPress();
      expect(reactNativeMocks.hardwareBackHandler?.()).toBe(true);
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Upload in progress",
      expect.any(String),
    );
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
    await act(async () => {
      resolveComplete?.({
        uploadId: "upload-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        status: "uploaded",
        completedAt: "2026-07-18T00:00:00.000Z",
        transcriptionJobId: "job-1",
      });
      await Promise.resolve();
    });
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file:///mock/recording.m4a", {
      idempotent: true,
    });
  });

  it("explains microphone denial in recovery-oriented language", async () => {
    vi.mocked(requestRecordingPermissionsAsync).mockResolvedValueOnce({ granted: false });

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    expect(hasText(renderer, "Microphone access is needed to record a recap."))
      .toBe(true);
    expect(hasText(renderer, "Allow microphone access in Android settings and try again."))
      .toBe(true);
    expect(() => findButton(renderer, "Start Recording")).not.toThrow();
  });

  it("supports one-tap start and stop controls", async () => {
    const uploadRecap = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "https://example.com/upload-1",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    }));
    const completeUpload = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      status: "uploaded" as const,
      completedAt: "2026-04-29T00:00:00.000Z",
      transcriptionJobId: "job-1",
    }));

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={uploadRecap}
        completeUpload={completeUpload}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });

    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith("file:///cache/Audio", {
      intermediates: true,
    });
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(() => findButton(renderer, "Stop & Process Note")).not.toThrow();
    expect(() => findButton(renderer, "Pause")).not.toThrow();
  });

  it("gives pause and restart matching secondary affordances", async () => {
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });

    const pauseButton = findButton(renderer, "Pause");
    const restartButton = findButton(renderer, "Restart");

    expect(restartButton.props.style({ pressed: false })).toEqual(
      pauseButton.props.style({ pressed: false }),
    );
  });

  it("supports pause and resume during recording", async () => {
    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Pause").props.onPress();
    });

    expect(() => findButton(renderer, "Resume")).not.toThrow();
  });

  it("keeps a stopped recording until discard and restart is confirmed", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    vi.mocked(FileSystem.deleteAsync).mockClear();
    await act(async () => {
      findButton(renderer, "Discard & Restart").props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Discard recording?",
      expect.stringContaining("deletes the recorded recap"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Keep recording", style: "cancel" }),
        expect.objectContaining({ text: "Discard & Restart", style: "destructive" }),
      ]),
    );
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();

    const actions = vi.mocked(Alert.alert).mock.calls[0]?.[2];
    actions?.[0]?.onPress?.();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();

    await act(async () => {
      actions?.[1]?.onPress?.();
      await Promise.resolve();
    });

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file:///mock/recording.m4a", {
      idempotent: true,
    });
    expect(() => findButton(renderer, "Start Recording")).not.toThrow();
  });

  it("confirms before restarting an in-progress recording", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    mockAudioState.url = "file:///mock/recording.m4a";
    await act(async () => {
      findButton(renderer, "Pause").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Resume").props.onPress();
    });
    vi.mocked(FileSystem.deleteAsync).mockClear();
    await act(async () => {
      findButton(renderer, "Restart").props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const actions = vi.mocked(Alert.alert).mock.calls[0]?.[2];
    expect(actions?.[0]).toMatchObject({ text: "Keep recording", style: "cancel" });
    actions?.[0]?.onPress?.();

    expect(mockRecorder.stop).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();

    await act(async () => {
      findButton(renderer, "Restart").props.onPress();
    });
    const destructiveActions = vi.mocked(Alert.alert).mock.calls[1]?.[2];
    await act(async () => {
      destructiveActions?.[1]?.onPress?.();
      await Promise.resolve();
    });

    expect(mockRecorder.stop).toHaveBeenCalledOnce();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file:///mock/recording.m4a", {
      idempotent: true,
    });
    expect(() => findButton(renderer, "Start Recording")).not.toThrow();
  });

  it("rewinds an ended recording before replaying it", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 8000;
    mockPlaybackStatus.playbackState = "ended";

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Play recording").props.onPress();
    });

    expect(mockPlaybackPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockPlaybackPlayer.play).toHaveBeenCalledTimes(1);
  });

  it("does not pause playback during cleanup when the screen unmounts", async () => {
    const previousPause = mockPlaybackPlayer.pause;
    mockPlaybackPlayer.pause = vi.fn(() => {
      throw new Error("cleanup should not pause playback");
    });

    try {
      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={vi.fn()}
          completeUpload={vi.fn()}
        />,
      );

      await act(async () => {
        renderer.unmount();
      });

      expect(mockPlaybackPlayer.pause).not.toHaveBeenCalled();
    } finally {
      mockPlaybackPlayer.pause = previousPause;
    }
  });

  it("uses expo-audio with m4a/aac/mono recording options", async () => {
    const expoAudio = await import("expo-audio");

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });

    expect(expoAudio.useAudioRecorder).toHaveBeenCalled();
    const options = (expoAudio.useAudioRecorder as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(options).toMatchObject({
      extension: ".m4a",
      numberOfChannels: 1,
      android: expect.objectContaining({
        extension: ".m4a",
        outputFormat: "mpeg4",
        audioEncoder: "aac",
      }),
      ios: expect.objectContaining({
        extension: ".m4a",
      }),
    });
  });

  it("shows Upload Recap button when a recording URI is available after stop", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });

    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });

    expect(() => findButton(renderer, "Upload Recap")).not.toThrow();
    const uploadButton = findButton(renderer, "Upload Recap");
    expect(uploadButton.props.disabled).toBe(false);
  });

  it("keeps upload disabled and shows guidance when recording is below minimum duration", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 4000;

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });

    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });

    const uploadButton = findButton(renderer, "Upload Recap");
    expect(uploadButton.props.disabled).toBe(true);

    const helperTextNode = renderer.root.find(
      (node) =>
        node.type === "Text" &&
        node.children.some(
          (child) => typeof child === "string" && child.includes("Record at least"),
        ),
    );
    expect(helperTextNode).toBeDefined();
  });

  it("shows error text when no recording URI is available after stop", async () => {
    mockRecorder.uri = null;
    mockAudioState.url = null;
    mockAudioState.durationMillis = 5000;

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={vi.fn()}
        completeUpload={vi.fn()}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });

    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
      // Allow the 300ms retry timeout to elapse
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(() => findButton(renderer, "No Recording Yet")).not.toThrow();
    const uploadButton = findButton(renderer, "No Recording Yet");
    expect(uploadButton.props.disabled).toBe(true);

    const errorTextNode = renderer.root.find(
      (node) =>
        node.type === "Text" &&
        node.children.some(
          (child) => child === "Recording file not found. Please restart and try again.",
        ),
    );
    expect(errorTextNode).toBeDefined();
  });

  it("calls metadata with all required fields before any file upload", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;

    const uploadRecap = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "https://storage.example.com/presigned-upload-url",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    }));

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={uploadRecap}
        completeUpload={vi.fn(async () => ({
          uploadId: "upload-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          status: "uploaded" as const,
          completedAt: "2026-04-29T00:00:00.000Z",
          transcriptionJobId: "job-1",
        }))}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Upload Recap").props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(uploadRecap).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
      mimeType: "audio/mp4",
      fileName: "recording.m4a",
      fileSizeBytes: 1024,
      durationSeconds: 5,
    });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file:///mock/recording.m4a", {
      idempotent: true,
    });
  });

  it("rounds the submitted duration up before the completion request", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 30100;

    const uploadRecap = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "https://storage.example.com/presigned-upload-url",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    }));

    const completionBodies: Array<Record<string, unknown>> = [];
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/v1/voice/uploads/upload-1/complete")) {
        completionBodies.push(JSON.parse(init?.body as string));
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadId: "upload-1",
              clinicId: "clinic-1",
              patientId: "patient-1",
              status: "uploaded",
              completedAt: "2026-04-29T00:00:00.000Z",
              transcriptionJobId: "job-1",
            },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={uploadRecap}
        completeUpload={undefined}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Upload Recap").props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(uploadRecap).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
      mimeType: "audio/mp4",
      fileName: "recording.m4a",
      fileSizeBytes: 1024,
      durationSeconds: 31,
    });
    expect(completionBodies[0]).toEqual(expect.objectContaining({
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
      storageKey: "voice/upload-1/recap.m4a",
      durationSeconds: 31,
    }));
  });

  it("uses the stopped duration snapshot when recorder state resets before upload", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5100;

    const uploadRecap = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "https://storage.example.com/presigned-upload-url",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    }));

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={uploadRecap}
        completeUpload={vi.fn(async () => ({
          uploadId: "upload-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          status: "uploaded" as const,
          completedAt: "2026-04-29T00:00:00.000Z",
          transcriptionJobId: "job-1",
        }))}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });

    mockAudioState.durationMillis = 0;

    await act(async () => {
      findButton(renderer, "Upload Recap").props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(uploadRecap).toHaveBeenCalledWith(expect.objectContaining({
      durationSeconds: 6,
    }));
  });

  it("falls back to a minimal file size when the filesystem does not report one", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;
    (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      exists: true,
      size: undefined,
    });

    const uploadRecap = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "https://storage.example.com/presigned-upload-url",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    }));

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={uploadRecap}
        completeUpload={vi.fn(async () => ({
          uploadId: "upload-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          status: "uploaded" as const,
          completedAt: "2026-04-29T00:00:00.000Z",
          transcriptionJobId: "job-1",
        }))}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Upload Recap").props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(uploadRecap).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
      mimeType: "audio/mp4",
      fileName: "recording.m4a",
      fileSizeBytes: 1,
      durationSeconds: 5,
    });
  });

  it("waits for the recording file to exist before starting upload", async () => {
    vi.useFakeTimers();

    try {
      mockRecorder.uri = "file:///cache/Audio/recording-123.m4a";
      mockAudioState.durationMillis = 5000;
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: true, size: 1024 });

      const uploadRecap = vi.fn(async () => ({
        uploadId: "upload-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadUrl: "https://storage.example.com/presigned-upload-url",
        storageKey: "voice/upload-1/recap.m4a",
        expiresAt: "2026-04-29T00:00:00.000Z",
      }));

      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={uploadRecap}
          completeUpload={vi.fn(async () => ({
            uploadId: "upload-1",
            clinicId: "clinic-1",
            patientId: "patient-1",
            status: "uploaded" as const,
            completedAt: "2026-04-29T00:00:00.000Z",
            transcriptionJobId: "job-1",
          }))}
        />,
      );

      await act(async () => {
        findButton(renderer, "Start Recording").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Stop & Process Note").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Upload Recap").props.onPress();
      });

      expect(uploadRecap).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith("file:///cache/Audio/recording-123.m4a");
      expect(uploadRecap).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("copies the bundled speech fixture on the Android emulator when the recorder file never appears", async () => {
    vi.useFakeTimers();
    vi.stubEnv("EXPO_OS", "android");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://127.0.0.1:3000");
    const previousHostUri = mockedExpoConfig.hostUri;
    mockedExpoConfig.hostUri = "127.0.0.1:8081";

    try {
      mockRecorder.uri = "file:///cache/Audio/recording-123.m4a";
      mockAudioState.durationMillis = 6000;
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockImplementation(async (uri: string) => {
        if (uri.endsWith(".synthetic.m4a")) {
          return { exists: true, size: 23300 };
        }
        return { exists: false, size: 0 };
      });

      const uploadRecap = vi.fn(async () => ({
        uploadId: "upload-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadUrl: "https://storage.example.com/presigned-upload-url",
        storageKey: "voice/upload-1/recap.m4a",
        expiresAt: "2026-04-29T00:00:00.000Z",
      }));
      const completeUpload = vi.fn(async () => ({
        uploadId: "upload-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        status: "uploaded" as const,
        completedAt: "2026-04-29T00:00:00.000Z",
        transcriptionJobId: "job-1",
      }));

      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={uploadRecap}
          completeUpload={completeUpload}
        />,
      );

      await act(async () => {
        findButton(renderer, "Start Recording").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Stop & Process Note").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Upload Recap").props.onPress();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      const copyCalls = (FileSystem.copyAsync as ReturnType<typeof vi.fn>).mock.calls;
      expect(copyCalls).toHaveLength(1);
      expect(copyCalls[0]?.[0]).toEqual({
        from: "file:///mock/staging-voice-fallback.m4a",
        to: "file:///cache/Audio/recording-123.synthetic.m4a",
      });

      expect(uploadRecap).toHaveBeenCalledWith({
        clinicId: "clinic-1",
        patientId: "patient-1",
        mimeType: "audio/mp4",
        fileName: "recording-123.synthetic.m4a",
        fileSizeBytes: 23300,
        durationSeconds: 6,
      });

      const fallbackUploadCall = findFetchCall(
        (url, init) =>
          url === "https://storage.example.com/presigned-upload-url" &&
          init?.method === "PUT",
      );
      expect(fallbackUploadCall).toBeDefined();
      const fallbackHeaders = fallbackUploadCall?.[1]?.headers as Record<string, string> | undefined;
      expect(fallbackHeaders?.["content-type"]).toBe("audio/mp4");
      expect(fallbackHeaders?.authorization).toBeUndefined();
      expect(fallbackHeaders?.["x-clinic-id"]).toBeUndefined();
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockReset();
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        size: 1024,
      });
      mockedExpoConfig.hostUri = previousHostUri;
    }
  });

  it("forces the bundled speech fixture during staging QA runs", async () => {
    vi.stubEnv("EXPO_PUBLIC_FORCE_STAGING_VOICE_FIXTURE", "1");

    try {
      mockRecorder.uri = "file:///cache/Audio/recording-456.m4a";
      mockAudioState.durationMillis = 7000;

      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockImplementation(async (uri: string) => {
        if (uri.endsWith(".synthetic.m4a")) {
          return { exists: true, size: 23300 };
        }
        return { exists: true, size: 4096 };
      });

      const uploadRecap = vi.fn(async () => ({
        uploadId: "upload-qa-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadUrl: "https://storage.example.com/presigned-upload-url",
        storageKey: "voice/upload-qa-1/recap.m4a",
        expiresAt: "2026-04-29T00:00:00.000Z",
      }));

      const completeUpload = vi.fn(async () => ({
        uploadId: "upload-qa-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        status: "uploaded" as const,
        completedAt: "2026-04-29T00:00:00.000Z",
        transcriptionJobId: "job-qa-1",
      }));

      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={uploadRecap}
          completeUpload={completeUpload}
        />,
      );

      await act(async () => {
        findButton(renderer, "Start Recording").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Stop & Process Note").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Upload Recap").props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const copyCalls = (FileSystem.copyAsync as ReturnType<typeof vi.fn>).mock.calls;
      const stagingCopyCall = copyCalls.find((call) => {
        const options = call[0] as { to?: string } | undefined;
        return options?.to === "file:///cache/Audio/recording-456.synthetic.m4a";
      });
      expect(stagingCopyCall).toBeDefined();
      expect(uploadRecap).toHaveBeenCalledWith({
        clinicId: "clinic-1",
        patientId: "patient-1",
        mimeType: "audio/mp4",
        fileName: "recording-456.synthetic.m4a",
        fileSizeBytes: 23300,
        durationSeconds: 7,
      });
      expect(completeUpload).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockReset();
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        size: 1024,
      });
    }
  });

  it("falls back to the downloaded fixture path when the cache copy fails", async () => {
    vi.stubEnv("EXPO_OS", "android");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://127.0.0.1:3000");
    vi.stubEnv("EXPO_PUBLIC_FORCE_STAGING_VOICE_FIXTURE", "1");

    const previousHostUri = mockedExpoConfig.hostUri;
    mockedExpoConfig.hostUri = "127.0.0.1:8081";

    try {
      mockRecorder.uri = "file:///cache/Audio/recording-789.m4a";
      mockAudioState.durationMillis = 7000;
      (FileSystem.copyAsync as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("copy failed"),
      );
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockImplementation(async (uri: string) => {
        if (uri === mockVoiceFixtureAsset.localUri) {
          return { exists: true, size: 23300 };
        }
        return { exists: true, size: 4096 };
      });

      const uploadRecap = vi.fn(async () => ({
        uploadId: "upload-fallback-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadUrl: "https://storage.example.com/presigned-upload-url",
        storageKey: "voice/upload-fallback-1/recap.m4a",
        expiresAt: "2026-04-29T00:00:00.000Z",
      }));
      const completeUpload = vi.fn(async () => ({
        uploadId: "upload-fallback-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        status: "uploaded" as const,
        completedAt: "2026-04-29T00:00:00.000Z",
        transcriptionJobId: "job-fallback-1",
      }));

      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={uploadRecap}
          completeUpload={completeUpload}
        />,
      );

      await act(async () => {
        findButton(renderer, "Start Recording").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Stop & Process Note").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Upload Recap").props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(uploadRecap).toHaveBeenCalledWith({
        clinicId: "clinic-1",
        patientId: "patient-1",
        mimeType: "audio/mp4",
        fileName: "staging-voice-fallback.m4a",
        fileSizeBytes: 23300,
        durationSeconds: 7,
      });
      expect(completeUpload).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      (FileSystem.copyAsync as ReturnType<typeof vi.fn>).mockReset();
      (FileSystem.copyAsync as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockReset();
      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: true,
        size: 1024,
      });
      mockedExpoConfig.hostUri = previousHostUri;
    }
  });

  it("uploads directly to the presigned URL without prepending baseUrl and without auth headers", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;

    const uploadRecap = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "https://storage.example.com/presigned-upload-url",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    }));

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={uploadRecap}
        completeUpload={vi.fn(async () => ({
          uploadId: "upload-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          status: "uploaded" as const,
          completedAt: "2026-04-29T00:00:00.000Z",
          transcriptionJobId: "job-1",
        }))}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Upload Recap").props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Verify the presigned PUT went directly to storage and stayed auth-free.
    const storagePutCall = findFetchCall(
      (url, init) =>
        url === "https://storage.example.com/presigned-upload-url" &&
        init?.method === "PUT",
    );
    expect(storagePutCall).toBeDefined();

    const [_input, options] = storagePutCall!;
    const storageHeaders = options?.headers as Record<string, string> | undefined;
    expect(storageHeaders?.["content-type"]).toBe("audio/mp4");
    expect(storageHeaders?.authorization).toBeUndefined();
    expect(storageHeaders?.["x-clinic-id"]).toBeUndefined();

    const storageBody = options?.body;
    expect(storageBody).toBeInstanceOf(Uint8Array);
    expect(Array.from(storageBody as Uint8Array)).toEqual([65, 66, 67]);
  });

  it("uploads local fallback URLs through the backend with auth headers", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;

    const uploadRecap = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "/api/v1/voice/uploads/upload-1/binary",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    }));

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={uploadRecap}
        completeUpload={vi.fn(async () => ({
          uploadId: "upload-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          status: "uploaded" as const,
          completedAt: "2026-04-29T00:00:00.000Z",
          transcriptionJobId: "job-1",
        }))}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Upload Recap").props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const localUploadCall = findFetchCall(
      (url, init) => url.endsWith("/api/v1/voice/uploads/upload-1/binary") && init?.method === "PUT",
    );
    expect(localUploadCall).toBeDefined();

    const [_input, options] = localUploadCall!;
    const localHeaders = options?.headers as Record<string, string> | undefined;
    expect(localHeaders?.["content-type"]).toBe("audio/mp4");
    expect(localHeaders?.authorization).toBe("Bearer access-token");
    expect(localHeaders?.["x-clinic-id"]).toBe("clinic-1");
  });

  it("completes upload only after presigned PUT succeeds and passes transcription job to onUploadComplete", async () => {
    mockRecorder.uri = "file:///mock/recording.m4a";
    mockAudioState.durationMillis = 5000;

    let completionCalled = false;
    const uploadRecap = vi.fn(async () => ({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "https://storage.example.com/presigned-upload-url",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    }));

    const completeUpload = vi.fn(async () => {
      completionCalled = true;
      return {
        uploadId: "upload-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        status: "uploaded" as const,
        completedAt: "2026-04-29T00:00:00.000Z",
        transcriptionJobId: "transcription-job-1",
      };
    });

    const onUploadComplete = vi.fn();

    const renderer = await render(
      <VoiceCaptureScreen
        clinicId="clinic-1"
        patientId="patient-1"
        uploadRecap={uploadRecap}
        completeUpload={completeUpload}
        onUploadComplete={onUploadComplete}
      />,
    );

    await act(async () => {
      findButton(renderer, "Start Recording").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Stop & Process Note").props.onPress();
    });
    await act(async () => {
      findButton(renderer, "Upload Recap").props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Completion must be called after the upload succeeds
    expect(completionCalled).toBe(true);
    expect(completeUpload).toHaveBeenCalledWith({
      uploadId: "upload-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadUrl: "https://storage.example.com/presigned-upload-url",
      storageKey: "voice/upload-1/recap.m4a",
      expiresAt: "2026-04-29T00:00:00.000Z",
    });

    // onUploadComplete must receive the complete response with transcription job
    expect(onUploadComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptionJobId: "transcription-job-1",
      }),
    );
  });

  describe("consent gate", () => {
    it("shows consent confirmation when upload metadata returns patient_consent_required", async () => {
      mockRecorder.uri = "file:///mock/recording.m4a";
      mockAudioState.durationMillis = 5000;

      // First call: upload metadata returns consent required
      const uploadRecap = vi
        .fn()
        .mockRejectedValueOnce(new Error("patient_consent_required"));

      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={uploadRecap}
          completeUpload={vi.fn()}
        />,
      );

      // Record and stop
      await act(async () => {
        findButton(renderer, "Start Recording").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Stop & Process Note").props.onPress();
      });

      // Trigger upload — should show consent button after rejection
      await act(async () => {
        findButton(renderer, "Upload Recap").props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Consent confirmation button should appear
      expect(() =>
        findButton(renderer, "Confirm Consent"),
      ).not.toThrow();
    });

    it("shows consent confirmation when upload completion returns patient_consent_required", async () => {
      mockRecorder.uri = "file:///mock/recording.m4a";
      mockAudioState.durationMillis = 5000;

      const uploadRecap = vi.fn(async () => ({
        uploadId: "upload-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadUrl: "https://storage.example.com/presigned-upload-url",
        storageKey: "voice/upload-1/recap.m4a",
        expiresAt: "2026-04-29T00:00:00.000Z",
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: "patient_consent_required",
        }),
      });

      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={uploadRecap}
          completeUpload={undefined}
        />,
      );

      await act(async () => {
        findButton(renderer, "Start Recording").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Stop & Process Note").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Upload Recap").props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(() =>
        findButton(renderer, "Confirm Consent"),
      ).not.toThrow();
    });

    it("calls consent endpoint when clinician confirms consent", async () => {
      mockRecorder.uri = "file:///mock/recording.m4a";
      mockAudioState.durationMillis = 5000;

      // First call to upload metadata: consent required
      const uploadRecap = vi
        .fn()
        .mockRejectedValueOnce(new Error("patient_consent_required"))
        // After consent, upload succeeds
        .mockResolvedValueOnce({
          uploadId: "upload-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          uploadUrl: "https://storage.example.com/presigned-upload-url",
          storageKey: "voice/upload-1/recap.m4a",
          expiresAt: "2026-04-29T00:00:00.000Z",
        });

      // Mock consent endpoint fetch call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: {
            id: "consent-1",
            clinicId: "clinic-1",
            patientId: "patient-1",
            type: "recording_ai_processing",
            status: "active",
            source: "clinician_confirmed_mobile",
            consentTextVersion: "v1-2026",
            consentedAt: new Date().toISOString(),
            revokedAt: null,
          },
        }),
      });

      const completeUpload = vi.fn(async () => ({
        uploadId: "upload-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        status: "uploaded" as const,
        completedAt: "2026-04-29T00:00:00.000Z",
        transcriptionJobId: "job-1",
      }));

      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={uploadRecap}
          completeUpload={completeUpload}
        />,
      );

      await act(async () => {
        findButton(renderer, "Start Recording").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Stop & Process Note").props.onPress();
      });

      // Upload — triggers consent required
      await act(async () => {
        findButton(renderer, "Upload Recap").props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Press consent confirm button
      await act(async () => {
        findButton(renderer, "Confirm Consent").props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Verify consent endpoint was called
      const consentCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" && call[0].includes("/api/v1/voice/consents"),
      );
      expect(consentCalls.length).toBeGreaterThanOrEqual(1);

      const [url, options] = consentCalls[0] as [string, { method: string; body: string }];
      expect(url).toContain("/api/v1/voice/consents");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body).toEqual(
        expect.objectContaining({
          patientId: "patient-1",
          consentTextVersion: expect.any(String),
        }),
      );
    });

    it("completes presigned upload sequence after consent confirmation", async () => {
      mockRecorder.uri = "file:///mock/recording.m4a";
      mockAudioState.durationMillis = 5000;

      // Upload metadata: first rejected, then succeeds after consent
      const uploadRecap = vi
        .fn()
        .mockRejectedValueOnce(new Error("patient_consent_required"))
        .mockResolvedValueOnce({
          uploadId: "upload-1",
          clinicId: "clinic-1",
          patientId: "patient-1",
          uploadUrl: "https://storage.example.com/presigned-upload-url",
          storageKey: "voice/upload-1/recap.m4a",
          expiresAt: "2026-04-29T00:00:00.000Z",
        });

      // Mock consent endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: {
            id: "consent-1",
            clinicId: "clinic-1",
            patientId: "patient-1",
            type: "recording_ai_processing",
            status: "active",
            source: "clinician_confirmed_mobile",
            consentTextVersion: "v1-2026",
            consentedAt: new Date().toISOString(),
            revokedAt: null,
          },
        }),
      });

      const completeUpload = vi.fn(async () => ({
        uploadId: "upload-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        status: "uploaded" as const,
        completedAt: "2026-04-29T00:00:00.000Z",
        transcriptionJobId: "job-1",
      }));

      const renderer = await render(
        <VoiceCaptureScreen
          clinicId="clinic-1"
          patientId="patient-1"
          uploadRecap={uploadRecap}
          completeUpload={completeUpload}
        />,
      );

      await act(async () => {
        findButton(renderer, "Start Recording").props.onPress();
      });
      await act(async () => {
        findButton(renderer, "Stop & Process Note").props.onPress();
      });

      // Upload triggers consent required
      await act(async () => {
        findButton(renderer, "Upload Recap").props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Confirm consent
      await act(async () => {
        findButton(renderer, "Confirm Consent").props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // After consent, the presigned upload sequence should run:
      // uploadRecap (retry) -> fetch PUT -> completeUpload
      expect(uploadRecap).toHaveBeenCalledTimes(2);

      // Verify presigned PUT was called
      const storagePutCall = findFetchCall(
        (url, init) =>
          url === "https://storage.example.com/presigned-upload-url" &&
          init?.method === "PUT",
      );
      expect(storagePutCall).toBeDefined();

      // Verify no auth headers on storage PUT
      const [_input, options] = storagePutCall!;
      const storageHeaders = options?.headers as Record<string, string> | undefined;
      expect(storageHeaders?.authorization).toBeUndefined();
      expect(storageHeaders?.["x-clinic-id"]).toBeUndefined();

      // Verify completion was called
      expect(completeUpload).toHaveBeenCalledTimes(1);
    });
  });
});
