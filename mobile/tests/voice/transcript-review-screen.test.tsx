import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reactNativeMocks = vi.hoisted(() => ({
  hardwareBackHandler: null as null | (() => boolean),
  hardwareBackHandlers: [] as Array<() => boolean>,
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
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

vi.mock("../../features/voice/hooks/useTranscriptReview", () => ({
  useTranscriptReview: vi.fn(),
}));

vi.mock("../../features/voice/hooks/useSaveTranscriptEdit", () => ({
  useSaveTranscriptEdit: vi.fn(),
}));

vi.mock("../../features/voice/hooks/useVoiceJobs", () => ({
  useVoiceJobStatus: vi.fn(() => ({
    data: { status: "succeeded", errorMessage: null },
    refetch: vi.fn(),
  })),
  useRetryVoiceJob: vi.fn(() => ({
    retryVoiceJob: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("expo-audio", () => ({
  useAudioPlayer: vi.fn(),
  useAudioPlayerStatus: vi.fn(),
}));

import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Alert, BackHandler } from "react-native";
import { useTranscriptReview } from "../../features/voice/hooks/useTranscriptReview";
import { useSaveTranscriptEdit } from "../../features/voice/hooks/useSaveTranscriptEdit";
import { useVoiceJobStatus } from "../../features/voice/hooks/useVoiceJobs";
import { TranscriptReviewScreen } from "../../features/voice/screens/TranscriptReviewScreen";

function findButton(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  return renderer.root.find(
    (node) =>
      node.type === "Text" &&
      node.children.some((child) => child === label),
  ).parent as TestRenderer.ReactTestInstance;
}

function findByAccessibilityLabel(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  return renderer.root.findByProps({ accessibilityLabel: label });
}

function findText(
  renderer: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  return renderer.root.find(
    (node) =>
      node.type === "Text" &&
      node.children.some((child) => child === label),
  );
}

function dispatchHardwareBack(): boolean {
  for (const handler of [...reactNativeMocks.hardwareBackHandlers].reverse()) {
    if (handler()) {
      return true;
    }
  }
  return false;
}

describe("TranscriptReviewScreen", () => {
  beforeEach(() => {
    reactNativeMocks.hardwareBackHandler = null;
    reactNativeMocks.hardwareBackHandlers = [];
    vi.mocked(useAudioPlayer).mockReturnValue({
      play: vi.fn(),
      pause: vi.fn(),
      replace: vi.fn(),
    } as unknown as ReturnType<typeof useAudioPlayer>);
    vi.mocked(useAudioPlayerStatus).mockReturnValue({
      playing: false,
      currentTime: 0,
      didJustFinish: false,
    } as unknown as ReturnType<typeof useAudioPlayerStatus>);
    vi.mocked(useSaveTranscriptEdit).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useSaveTranscriptEdit>);
    vi.mocked(useVoiceJobStatus).mockReturnValue({
      data: { status: "succeeded", errorMessage: null },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useVoiceJobStatus>);
  });

  it("returns to the patient workflow through the explicit review back target", async () => {
    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: null,
      isLoading: true,
      isReady: false,
      refetch: vi.fn(),
      highlightedWordIndex: null,
      setPlaybackPositionMs: vi.fn(),
    });

    const onBack = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen
          clinicId="clinic-1"
          jobId="job-1"
          onBack={onBack}
          onGenerateSoap={vi.fn()}
        />,
      );
    });

    if (!renderer) {
      throw new Error("Renderer missing");
    }

    const backButton = renderer.root.findByProps({
      testID: "transcript-review-back-button",
    });
    await act(async () => {
      backButton.props.onPress();
    });

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("confirms from the header and Android Back before discarding unsaved transcript edits", async () => {
    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: {
        jobId: "job-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        transcriptStatus: "ready",
        speakerMode: "single",
        text: "Original text",
        segments: [{
          startMs: 0,
          endMs: 1000,
          text: "Original text",
          words: [{ startMs: 0, endMs: 1000, text: "Original text" }],
        }],
      },
      isLoading: false,
      isReady: true,
      refetch: vi.fn(),
      audioUrl: null,
    });

    const onBack = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen
          clinicId="clinic-1"
          jobId="job-1"
          onBack={onBack}
          onGenerateSoap={vi.fn()}
        />,
      );
    });
    if (!renderer) throw new Error("Renderer missing");

    await act(async () => {
      findButton(renderer, "Edit Transcript").props.onPress();
    });
    await act(async () => {
      renderer.root.findByType("TextInput").props.onChangeText("Unsaved edit");
    });

    await act(async () => {
      renderer.root.findByProps({ testID: "transcript-review-back-button" }).props.onPress();
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Discard transcript changes?",
      expect.any(String),
      expect.any(Array),
    );
    const headerButtons = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    headerButtons.find((button) => button.text === "Keep editing")?.onPress?.();
    expect(onBack).not.toHaveBeenCalled();
    expect(renderer.root.findByType("TextInput").props.value).toBe("Unsaved edit");

    await act(async () => {
      expect(reactNativeMocks.hardwareBackHandler?.()).toBe(true);
    });
    const hardwareButtons = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      hardwareButtons.find((button) => button.text === "Discard changes")?.onPress?.();
    });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("lets the transcript edit guard win over the app-shell Android Back listener", async () => {
    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: {
        jobId: "job-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        transcriptStatus: "ready",
        speakerMode: "single",
        text: "Original text",
        segments: [{
          startMs: 0,
          endMs: 1000,
          text: "Original text",
          words: [{ startMs: 0, endMs: 1000, text: "Original text" }],
        }],
      },
      isLoading: false,
      isReady: true,
      refetch: vi.fn(),
      audioUrl: null,
    });
    const onBack = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen
          clinicId="clinic-1"
          jobId="job-1"
          onBack={onBack}
          onGenerateSoap={vi.fn()}
        />,
      );
    });
    if (!renderer) throw new Error("Renderer missing");
    await act(async () => {
      findButton(renderer, "Edit Transcript").props.onPress();
    });
    await act(async () => {
      renderer.root.findByType("TextInput").props.onChangeText("Unsaved edit");
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
      "Discard transcript changes?",
      expect.any(String),
      expect.any(Array),
    );
    expect(appShellBack).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
    appShellSubscription.remove();
  });

  it("blocks SOAP generation while transcript is loading", async () => {
    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: null,
      isLoading: true,
      isReady: false,
      refetch: vi.fn(),
      highlightedWordIndex: null,
      setPlaybackPositionMs: vi.fn(),
    });

    const onGenerateSoap = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={onGenerateSoap} />,
      );
    });

    if (!renderer) {
      throw new Error("Renderer missing");
    }

    await act(async () => {
      findButton(renderer, "Generate SOAP Note").props.onPress();
    });

    expect(onGenerateSoap).not.toHaveBeenCalled();
    expect(() =>
      renderer.root.findByProps({ testID: "transcript-review-edit-button" }),
    ).toThrow();
  });

  it("renders single-speaker transcript as one clinician card and updates highlight from playback", async () => {
    const setPlaybackPositionMs = vi.fn();
    const playMock = vi.fn();
    const pauseMock = vi.fn();

    vi.mocked(useAudioPlayer).mockReturnValue({
      play: playMock,
      pause: pauseMock,
      replace: vi.fn(),
    } as unknown as ReturnType<typeof useAudioPlayer>);

    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: {
        jobId: "job-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        transcriptStatus: "ready",
        speakerMode: "single",
        text: "Patient reports less pain",
        segments: [
          {
            startMs: 0,
            endMs: 1000,
            text: "Patient reports",
            words: [
              { startMs: 0, endMs: 300, text: "Patient" },
              { startMs: 301, endMs: 700, text: "reports" },
            ],
          },
          {
            startMs: 1001,
            endMs: 1800,
            text: "less pain",
            words: [
              { startMs: 1001, endMs: 1300, text: "less" },
              { startMs: 1301, endMs: 1800, text: "pain" },
            ],
          },
        ],
      },
      isLoading: false,
      isReady: true,
      refetch: vi.fn(),
      highlightedWordIndex: 1,
      setPlaybackPositionMs,
      audioUrl: "https://example.com/audio.mp3",
    });

    const onGenerateSoap = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={onGenerateSoap} />,
      );
    });

    if (!renderer) {
      throw new Error("Renderer missing");
    }

    const clinicianLabels = renderer.root.findAll(
      (node) =>
        node.type === "Text" &&
        Array.isArray(node.children) &&
        node.children.some((child) => child === "Clinician"),
    );
    expect(clinicianLabels).toHaveLength(1);
    expect(renderer.root.findAllByProps({ accessibilityLabel: "Highlighted transcript word" }).length).toBe(1);

    await act(async () => {
      findByAccessibilityLabel(renderer, "Start playback").props.onPress();
    });

    expect(playMock).toHaveBeenCalled();

    vi.mocked(useAudioPlayerStatus).mockReturnValue({
      playing: true,
      currentTime: 0.5,
      didJustFinish: false,
    } as unknown as ReturnType<typeof useAudioPlayerStatus>);

    await act(async () => {
      renderer!.update(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={onGenerateSoap} />,
      );
    });

    await act(async () => {
      findByAccessibilityLabel(renderer, "Pause playback").props.onPress();
    });

    expect(pauseMock).toHaveBeenCalled();

    await act(async () => {
      findButton(renderer, "Generate SOAP Note").props.onPress();
    });

    expect(onGenerateSoap).toHaveBeenCalledWith("Patient reports less pain");
  });

  it("passes edited transcript to generate SOAP action", async () => {
    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: {
        jobId: "job-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        transcriptStatus: "ready",
        speakerMode: "single",
        text: "Original transcript text",
        segments: [
          {
            startMs: 0,
            endMs: 1000,
            text: "Original transcript text",
            words: [
              { startMs: 0, endMs: 300, text: "Original" },
              { startMs: 301, endMs: 700, text: "transcript" },
              { startMs: 701, endMs: 1000, text: "text" },
            ],
          },
        ],
      },
      isLoading: false,
      isReady: true,
      refetch: vi.fn(),
      highlightedWordIndex: null,
      setPlaybackPositionMs: vi.fn(),
      audioUrl: "https://example.com/audio.mp3",
    });

    const onGenerateSoap = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={onGenerateSoap} />,
      );
    });

    if (!renderer) {
      throw new Error("Renderer missing");
    }

    await act(async () => {
      findButton(renderer, "Edit Transcript").props.onPress();
    });

    const textInput = renderer.root.findByType("TextInput");
    await act(async () => {
      textInput.props.onChangeText("Edited transcript text");
    });

    await act(async () => {
      findButton(renderer, "Save").props.onPress();
    });

    await act(async () => {
      findButton(renderer, "Generate SOAP Note").props.onPress();
    });

    expect(onGenerateSoap).toHaveBeenCalledWith("Edited transcript text");
  });

  it("submits a confirmed transcript only once", async () => {
    const onGenerateSoap = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen
          clinicId="clinic-1"
          jobId="job-1"
          onGenerateSoap={onGenerateSoap}
        />,
      );
    });
    if (!renderer) throw new Error("Renderer missing");

    const generateButton = findButton(renderer, "Generate SOAP Note");
    await act(async () => {
      generateButton.props.onPress();
      generateButton.props.onPress();
    });

    expect(onGenerateSoap).toHaveBeenCalledOnce();
  });

  it("allows SOAP generation for a newly selected job after the prior job was submitted", async () => {
    vi.mocked(useTranscriptReview).mockImplementation((_, jobId) => ({
      transcript: {
        jobId,
        clinicId: "clinic-1",
        patientId: "patient-1",
        transcriptStatus: "ready",
        speakerMode: "single",
        text: `Transcript for ${jobId}`,
        segments: [],
      },
      isLoading: false,
      isReady: true,
      refetch: vi.fn(),
      highlightedWordIndex: null,
      setPlaybackPositionMs: vi.fn(),
      audioUrl: null,
    }));

    const onGenerateSoap = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={onGenerateSoap} />,
      );
    });
    if (!renderer) throw new Error("Renderer missing");

    await act(async () => {
      findButton(renderer, "Generate SOAP Note").props.onPress();
    });
    await act(async () => {
      renderer.update(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-2" onGenerateSoap={onGenerateSoap} />,
      );
    });
    await act(async () => {
      findButton(renderer, "Generate SOAP Note").props.onPress();
    });

    expect(onGenerateSoap).toHaveBeenNthCalledWith(1, "Transcript for job-1");
    expect(onGenerateSoap).toHaveBeenNthCalledWith(2, "Transcript for job-2");
  });

  it("shows SOAP failure copy while still allowing transcript-based recovery", async () => {
    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: {
        jobId: "job-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        transcriptStatus: "ready",
        speakerMode: "single",
        text: "Recovered transcript text",
        segments: [
          {
            startMs: 0,
            endMs: 1000,
            text: "Recovered transcript text",
            words: [
              { startMs: 0, endMs: 300, text: "Recovered" },
              { startMs: 301, endMs: 700, text: "transcript" },
              { startMs: 701, endMs: 1000, text: "text" },
            ],
          },
        ],
      },
      isLoading: false,
      isReady: true,
      refetch: vi.fn(),
      audioUrl: "https://example.com/audio.mp3",
    });

    vi.mocked(useVoiceJobStatus).mockReturnValue({
      data: {
        jobId: "job-1",
        status: "failed",
        attempt: 1,
        stageState: "soap_failed",
        errorMessage: "SOAP provider rejected the draft",
      },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useVoiceJobStatus>);

    const onGenerateSoap = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={onGenerateSoap} />,
      );
    });

    if (!renderer) {
      throw new Error("Renderer missing");
    }

    expect(findText(renderer, "SOAP generation failed")).toBeTruthy();
    expect(findButton(renderer, "Retry SOAP Generation")).toBeTruthy();

    await act(async () => {
      findButton(renderer, "Generate SOAP Note").props.onPress();
    });

    expect(onGenerateSoap).toHaveBeenCalledWith("Recovered transcript text");
  });

  it("keeps transcription failure copy when the transcript never becomes available", async () => {
    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: null,
      isLoading: false,
      isReady: false,
      refetch: vi.fn(),
      audioUrl: null,
    });

    vi.mocked(useVoiceJobStatus).mockReturnValue({
      data: {
        jobId: "job-1",
        status: "failed",
        attempt: 1,
        stageState: "transcription_failed",
        errorMessage: "Voice binary upload failed",
      },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useVoiceJobStatus>);

    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={vi.fn()} />,
      );
    });

    if (!renderer) {
      throw new Error("Renderer missing");
    }

    expect(findText(renderer, "Transcription failed")).toBeTruthy();
    expect(findText(renderer, "Transcript unavailable.")).toBeTruthy();
  });

  it("calls save transcript mutation when Save is pressed", async () => {
    const saveTranscriptEdit = vi.fn().mockResolvedValue(undefined);

    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: {
        jobId: "job-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        transcriptStatus: "ready",
        speakerMode: "single",
        text: "Original text",
        segments: [
          {
            startMs: 0,
            endMs: 1000,
            text: "Original text",
            words: [
              { startMs: 0, endMs: 300, text: "Original" },
              { startMs: 301, endMs: 700, text: "text" },
            ],
          },
        ],
      },
      isLoading: false,
      isReady: true,
      refetch: vi.fn(),
      highlightedWordIndex: null,
      setPlaybackPositionMs: vi.fn(),
      audioUrl: "https://example.com/audio.mp3",
    });

    vi.mocked(useSaveTranscriptEdit).mockReturnValue({
      mutateAsync: saveTranscriptEdit,
      isPending: false,
      isIdle: true,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
      reset: vi.fn(),
      mutate: vi.fn(),
      status: "idle",
      failureCount: 0,
      failureReason: null,
    } as unknown as ReturnType<typeof useSaveTranscriptEdit>);

    const onGenerateSoap = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={onGenerateSoap} />,
      );
    });

    if (!renderer) {
      throw new Error("Renderer missing");
    }

    await act(async () => {
      findButton(renderer, "Edit Transcript").props.onPress();
    });

    const textInput = renderer.root.findByType("TextInput");
    await act(async () => {
      textInput.props.onChangeText("Edited text");
    });

    await act(async () => {
      findButton(renderer, "Save").props.onPress();
    });

    expect(saveTranscriptEdit).toHaveBeenCalledWith({
      jobId: "job-1",
      clinicId: "clinic-1",
      transcriptText: "Edited text",
    });
  });

  it("refetches the transcript when a later stage proves it should exist", async () => {
    const refetchTranscript = vi.fn();

    vi.mocked(useTranscriptReview).mockReturnValue({
      transcript: null,
      isLoading: false,
      isReady: false,
      refetch: refetchTranscript,
      audioUrl: null,
    });

    vi.mocked(useVoiceJobStatus).mockReturnValue({
      data: {
        jobId: "job-1",
        status: "failed",
        attempt: 1,
        stageState: "soap_failed",
        errorMessage: "SOAP provider rejected the draft",
      },
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useVoiceJobStatus>);

    await act(async () => {
      TestRenderer.create(
        <TranscriptReviewScreen clinicId="clinic-1" jobId="job-1" onGenerateSoap={vi.fn()} />,
      );
    });

    expect(refetchTranscript).toHaveBeenCalledTimes(1);
  });
});
