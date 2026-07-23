import React, { useMemo, useState } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { Mic } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import {
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingStatus,
} from "expo-audio";

import type {
  VoiceUploadCompleteResponse,
  VoiceUploadRequest,
  VoiceUploadResponse,
} from "../../../../shared/contracts/voice";
import { useAuth } from "../../auth/providers/AuthProvider";
import { usePatientProfile } from "../../patients/hooks/usePatients";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";
import { MeridianButton } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { getUserSafeErrorMessage } from "../../ui/userFacingErrors";

type RecorderState = "idle" | "recording" | "paused" | "stopped";

type UploadRecap = (input: VoiceUploadRequest) => Promise<VoiceUploadResponse>;
type CompleteUpload = (input: VoiceUploadResponse) => Promise<VoiceUploadCompleteResponse>;

type VoiceCaptureScreenProps = {
  clinicId: string;
  patientId: string;
  patientName?: string;
  conditionLabel?: string;
  onBack?: () => void;
  uploadRecap?: UploadRecap;
  completeUpload?: CompleteUpload;
  onUploadComplete?: (result: VoiceUploadCompleteResponse) => void;
};

const CAPTURE_OPTIONS = {
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4" as const,
    audioEncoder: "aac" as const,
  },
  ios: {
    extension: ".m4a",
    outputFormat: "aac " as const,
    audioQuality: 96,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

const RECORDING_URI_WAIT_MS = process.env.NODE_ENV === "test" ? 100 : 2000;
const RECORDING_URI_POLL_MS = 200;
const RECORDING_FILE_WAIT_MS = 8000;
const RECORDING_FILE_POLL_MS = 200;
const MIN_RECAP_DURATION_SECONDS = 5;
const RECORDING_CACHE_FOLDER = "Audio";
const WAVEFORM_BAR_KEYS = Array.from({ length: 16 }, (_, index) => `wave-${index}`);

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function buildWaveformBars(state: RecorderState): number[] {
  if (state === "idle") {
    return [6, 10, 14, 10, 6, 10, 14, 10, 6, 10, 14, 10, 6, 10, 14, 10];
  }
  if (state === "paused") {
    return [14, 20, 28, 34, 40, 34, 28, 20, 14, 12, 14, 20, 28, 34, 40, 34];
  }
  return [12, 22, 36, 44, 32, 42, 26, 38, 18, 30, 40, 28, 20, 34, 24, 16];
}

function isPatientConsentRequiredResponse(
  response: { status: number },
  payload: unknown,
): boolean {
  return (
    response.status === 403 &&
    payload !== null &&
    typeof payload === "object" &&
    (payload as { error?: unknown }).error === "patient_consent_required"
  );
}

function getRecordingDirectoryUri(): string | null {
  const cacheDirectory = FileSystem.cacheDirectory?.trim();
  if (!cacheDirectory) {
    return null;
  }

  return `${cacheDirectory.replace(/\/+$/, "")}/${RECORDING_CACHE_FOLDER}`;
}

function getRecordingUriSnapshot(
  recordingStatus: RecordingStatus | null,
  recorder: { getStatus?: () => { url: string | null } | null; uri?: string | null },
  recordingUriRef: React.MutableRefObject<string | null>,
  recordingUri: string | null,
  audioStateUrl: string | null,
): string | null {
  const statusUri = recordingStatus?.url ?? recorder.getStatus?.()?.url ?? null;
  return statusUri ?? recordingUriRef.current ?? recordingUri ?? audioStateUrl ?? recorder.uri ?? null;
}

async function waitForRecordingFile(
  fileUri: string,
  timeoutMs = RECORDING_FILE_WAIT_MS,
): Promise<Awaited<ReturnType<typeof FileSystem.getInfoAsync>> | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      return fileInfo;
    }
    await new Promise((resolve) => setTimeout(resolve, RECORDING_FILE_POLL_MS));
  }

  return null;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  }

  if (typeof atob === "function") {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }
    return bytes;
  }

  throw new Error("Binary file decoding is unavailable on this platform");
}

async function readFileAsUploadBody(fileUri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = decodeBase64ToBytes(base64);

  return bytes;
}

function pausePlaybackIfPlaying(
  playbackPlayer: { pause: () => void },
  playbackStatus: { playing?: boolean } | null | undefined,
): void {
  if (playbackStatus?.playing) {
    playbackPlayer.pause();
  }
}

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
  details?: unknown;
};

type HttpStatusError = Error & { status?: number };

function createHttpStatusError(message: string, status: number): HttpStatusError {
  const error = new Error(message) as HttpStatusError;
  error.status = status;
  return error;
}

function extractApiErrorMessage(defaultMessage: string, payload: unknown): string {
  if (payload && typeof payload === "object") {
    const parsed = payload as ApiErrorPayload;
    if (Array.isArray(parsed.details)) {
      const firstDetail = parsed.details.find(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      if (firstDetail) {
        return firstDetail;
      }
    }
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error;
    }
    if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message;
    }
  }
  return defaultMessage;
}

export function VoiceCaptureScreen({
  clinicId,
  patientId,
  patientName: patientNameProp,
  conditionLabel: conditionLabelProp,
  onBack,
  uploadRecap,
  completeUpload,
  onUploadComplete,
}: VoiceCaptureScreenProps): React.JSX.Element {
  const { runProtectedAction } = useAuth();
  const profileQuery = usePatientProfile(patientId);
  const recordingStatusRef = React.useRef<RecordingStatus | null>(null);
  const recorder = useAudioRecorder(CAPTURE_OPTIONS, (status) => {
    recordingStatusRef.current = status;
    if (__DEV__) {
      console.log("VoiceCaptureScreen recording status", status);
    }
    if (status.url) {
      recordingUriRef.current = status.url;
      setRecordingUri(status.url);
    }
  });
  const audioState = useAudioRecorderState(recorder, 500);
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "uploaded">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const [recordingDurationMillis, setRecordingDurationMillis] = useState(0);
  const [consentState, setConsentState] = useState<"not_required" | "required" | "confirming">("not_required");
  const playbackPlayer = useAudioPlayer(recordingUri ?? null, { updateInterval: 250 });
  const playbackStatus = useAudioPlayerStatus(playbackPlayer);
  const recordingUriRef = React.useRef<string | null>(null);
  const recordingPermissionRequestRef = React.useRef<Promise<boolean> | null>(null);
  const isMountedRef = React.useRef(true);
  const recorderStateRef = React.useRef<RecorderState>("idle");
  const uploadStateRef = React.useRef<"idle" | "uploading" | "uploaded">("idle");
  const uploadAttemptRef = React.useRef(0);

  const ensureRecordingPermission = React.useCallback(async (): Promise<boolean> => {
    if (!recordingPermissionRequestRef.current) {
      recordingPermissionRequestRef.current = (async () => {
        try {
          const permission = await requestRecordingPermissionsAsync();
          if (!permission.granted && isMountedRef.current) {
            setErrorText("Microphone permission denied.");
          }
          return permission.granted;
        } catch {
          if (isMountedRef.current) {
            setErrorText("Microphone permission denied.");
          }
          return false;
        }
      })();
    }

    const granted = await recordingPermissionRequestRef.current;
    if (!granted) {
      recordingPermissionRequestRef.current = null;
    }
    return granted;
  }, []);

  const durationSeconds =
    recorderState === "stopped" && recordingDurationSeconds > 0
      ? recordingDurationSeconds
      : Math.floor(audioState.durationMillis / 1000);
  const effectiveDurationSeconds =
    recorderState === "stopped" && recordingDurationSeconds > 0
      ? recordingDurationSeconds
      : Math.max(1, durationSeconds);
  const hasMinimumDuration = effectiveDurationSeconds >= MIN_RECAP_DURATION_SECONDS;

  const displayName = patientNameProp ?? profileQuery.data?.fullName ?? "";
  const displayCondition =
    conditionLabelProp ??
    (profileQuery.data?.conditionTags && profileQuery.data.conditionTags.length > 0
      ? profileQuery.data.conditionTags[0]
      : "");

  const waveformBars = useMemo(
    () => buildWaveformBars(recorderState),
    [recorderState],
  );

  React.useEffect(() => {
    recordingUriRef.current = recordingUri ?? audioState.url ?? recorder.uri ?? null;
  }, [audioState.url, recordingUri, recorder]);

  React.useEffect(() => {
    recorderStateRef.current = recorderState;
  }, [recorderState]);

  React.useEffect(() => {
    uploadStateRef.current = uploadState;
  }, [uploadState]);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      uploadAttemptRef.current += 1;
    };
  }, []);

  React.useEffect(() => {
    void ensureRecordingPermission();
  }, [ensureRecordingPermission]);

  React.useEffect(() => {
    return () => {
      if (recorderStateRef.current === "recording" || recorderStateRef.current === "paused") {
        void recorder.stop().catch(() => undefined);
      }
      const uri = recordingUriRef.current;
      if (uri && uploadStateRef.current !== "uploading") {
        void deleteRecordingFile(uri);
      }
    };
  }, [recorder]);

  function requestBack(): void {
    if (uploadStateRef.current === "uploading") {
      Alert.alert(
        "Upload in progress",
        "Keep this screen open until the recording finishes uploading.",
      );
      return;
    }

    if (recorderStateRef.current !== "idle" && uploadStateRef.current !== "uploaded") {
      Alert.alert(
        "Discard recording?",
        "This removes the local recording from this phone. You can keep recording instead.",
        [
          { text: "Keep recording", style: "cancel" },
          {
            text: "Discard recording",
            style: "destructive",
            onPress: () => void handleDiscardAndLeave(),
          },
        ],
      );
      return;
    }

    onBack?.();
  }

  React.useEffect(() => {
    if (!onBack) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, recorderState, uploadState]);

  async function deleteRecordingFile(uri: string | null): Promise<void> {
    if (!uri) {
      return;
    }
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    if (recordingUriRef.current === uri) {
      recordingUriRef.current = null;
    }
  }

  async function cleanupRecordingFile(): Promise<void> {
    const uri = recordingUriRef.current;
    await deleteRecordingFile(uri);
    if (isMountedRef.current) {
      setRecordingUri(null);
    }
  }

  const statusLabel = useMemo(() => {
    if (recorderState === "recording") return "Recording";
    if (recorderState === "paused") return "Paused";
    if (recorderState === "stopped") return "Ready to process";
    return "Ready to record";
  }, [recorderState]);

  async function handleStartRecording(): Promise<void> {
    const permissionGranted = await ensureRecordingPermission();
    if (!permissionGranted) {
      return;
    }
    await cleanupRecordingFile();
    recordingStatusRef.current = null;
    setRecordingUri(null);
    setRecordingDurationSeconds(0);
    setRecordingDurationMillis(0);
    setErrorText(null);
    setRecorderState("recording");

    try {
      const recordingDirectoryUri = getRecordingDirectoryUri();
      if (recordingDirectoryUri) {
        await FileSystem.makeDirectoryAsync(recordingDirectoryUri, {
          intermediates: true,
        });
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setRecorderState("idle");
      setErrorText("Recording setup failed. Please retry.");
    }
  }

  function handlePause(): void {
    recorder.pause();
    setRecorderState("paused");
  }

  function handleResume(): void {
    recorder.record();
    setRecorderState("recording");
  }

  async function handleStop(): Promise<void> {
    const capturedDurationMillis = Math.max(1000, audioState.durationMillis);
    const capturedDurationSeconds = Math.max(1, Math.floor(capturedDurationMillis / 1000));
    const recordingDirectoryUri = getRecordingDirectoryUri();
    if (recordingDirectoryUri) {
      await FileSystem.makeDirectoryAsync(recordingDirectoryUri, {
        intermediates: true,
      });
    }
    await recorder.stop();

    let uriAfterStop = getRecordingUriSnapshot(
      recordingStatusRef.current,
      recorder,
      recordingUriRef,
      recordingUri,
      audioState.url,
    );

    const stopStatus = recordingStatusRef.current;
    if (stopStatus?.hasError && !stopStatus.url) {
      setErrorText(
        getUserSafeErrorMessage(
          stopStatus.error,
          "Recording failed. Please restart and try again.",
        ),
      );
      recordingUriRef.current = null;
      setRecordingUri(null);
      setRecordingDurationSeconds(capturedDurationSeconds);
      setRecordingDurationMillis(capturedDurationMillis);
      setRecorderState("stopped");
      return;
    }

    if (!uriAfterStop) {
      const deadline = Date.now() + RECORDING_URI_WAIT_MS;
      while (!uriAfterStop && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, RECORDING_URI_POLL_MS));
        uriAfterStop = getRecordingUriSnapshot(
          recordingStatusRef.current,
          recorder,
          recordingUriRef,
          recordingUri,
          audioState.url,
        );
      }
    }

    if (!uriAfterStop) {
      setErrorText("Recording file not found. Please restart and try again.");
      if (__DEV__) {
        console.log("VoiceCaptureScreen missing recording URI", {
          stopStatus: recordingStatusRef.current,
          recordingUri: recordingUriRef.current,
          audioStateUrl: audioState.url,
          recorderUri: recorder.uri ?? null,
        });
      }
      recordingUriRef.current = null;
      setRecordingUri(null);
      setRecordingDurationSeconds(capturedDurationSeconds);
      setRecordingDurationMillis(capturedDurationMillis);
      setRecorderState("stopped");
      return;
    }

    setRecordingUri(uriAfterStop);
    setRecordingDurationSeconds(capturedDurationSeconds);
    setRecordingDurationMillis(capturedDurationMillis);
    setRecorderState("stopped");
  }

  async function uploadWithAuth(input: VoiceUploadRequest): Promise<VoiceUploadResponse> {
    const baseUrl = resolveApiBaseUrl();

    return runProtectedAction(async (accessToken) => {
      const response = await fetch(`${baseUrl}/api/v1/voice/uploads`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-clinic-id": input.clinicId,
        },
        body: JSON.stringify(input),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.success !== true || !payload.data) {
        // Detect consent-required error for DPDP patient consent gate
        if (isPatientConsentRequiredResponse(response, payload)) {
          throw new Error("patient_consent_required");
        }
        throw createHttpStatusError(
          extractApiErrorMessage("Voice upload initiation failed", payload),
          response.status,
        );
      }

      return payload.data as VoiceUploadResponse;
    });
  }

  async function uploadBinaryToPresignedUrl(uploadUrl: string, fileUri: string, mimeType: string): Promise<void> {
    const isLocalApiPath = uploadUrl.startsWith("/");
    const targetUrl = isLocalApiPath ? `${resolveApiBaseUrl()}${uploadUrl}` : uploadUrl;
    const headers: Record<string, string> = { "content-type": mimeType };
    const body = await readFileAsUploadBody(fileUri);

    if (isLocalApiPath) {
      await runProtectedAction(async (accessToken) => {
        const response = await fetch(targetUrl, {
          method: "PUT",
          headers: {
            ...headers,
            authorization: `Bearer ${accessToken}`,
            "x-clinic-id": clinicId,
          },
          body,
        });

        if (!response.ok) {
          const responseText = await response.text().catch(() => "");
          throw createHttpStatusError(
            responseText
              ? `Voice binary upload failed (${response.status}): ${responseText}`
              : `Voice binary upload failed (${response.status})`,
            response.status,
          );
        }
      });
      return;
    }

    const response = await fetch(targetUrl, {
      method: "PUT",
      headers,
      body,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw createHttpStatusError(
        responseText
          ? `Voice binary upload failed (${response.status}): ${responseText}`
          : `Voice binary upload failed (${response.status})`,
        response.status,
      );
    }
  }

  async function completeUploadWithAuth(
    input: VoiceUploadResponse,
    durationToPersistSeconds: number,
  ): Promise<VoiceUploadCompleteResponse> {
    const baseUrl = resolveApiBaseUrl();

    return runProtectedAction(async (accessToken) => {
      const response = await fetch(`${baseUrl}/api/v1/voice/uploads/${input.uploadId}/complete`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-clinic-id": clinicId,
        },
        body: JSON.stringify({
          clinicId,
          patientId,
          uploadId: input.uploadId,
          storageKey: input.storageKey,
          durationSeconds: durationToPersistSeconds,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.success !== true || !payload.data) {
        if (isPatientConsentRequiredResponse(response, payload)) {
          throw new Error("patient_consent_required");
        }
        throw createHttpStatusError(
          extractApiErrorMessage("Voice upload completion failed", payload),
          response.status,
        );
      }

      return payload.data as VoiceUploadCompleteResponse;
    });
  }

  async function confirmConsentAndUpload(): Promise<void> {
    setConsentState("confirming");
    setErrorText(null);

    try {
      await confirmConsentWithAuth();
      setConsentState("not_required");
      await handleUpload();
    } catch {
      setConsentState("not_required");
      setErrorText("Consent confirmation failed. Please retry.");
    }
  }

  async function confirmConsentWithAuth(): Promise<void> {
    const baseUrl = resolveApiBaseUrl();

    await runProtectedAction(async (accessToken) => {
      const response = await fetch(`${baseUrl}/api/v1/voice/consents`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-clinic-id": clinicId,
        },
        body: JSON.stringify({
          patientId,
          consentTextVersion: "v1-2026",
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.success !== true) {
        throw createHttpStatusError("Consent confirmation failed", response.status);
      }
    });
  }

  async function handleUpload(): Promise<void> {
    if (uploadStateRef.current === "uploading") {
      return;
    }
    let fileUri = getRecordingUriSnapshot(
      recordingStatusRef.current,
      recorder,
      recordingUriRef,
      recordingUri,
      audioState.url,
    );
    if (!fileUri) {
      setErrorText("No recording found");
      return;
    }
    if (effectiveDurationSeconds < MIN_RECAP_DURATION_SECONDS) {
      setErrorText(`Record at least ${formatTime(MIN_RECAP_DURATION_SECONDS)} before upload.`);
      return;
    }
    const durationMillisToPersist =
      recorderState === "stopped" && recordingDurationMillis > 0
        ? recordingDurationMillis
        : audioState.durationMillis;
    const durationToPersistSeconds = Math.max(1, Math.ceil(durationMillisToPersist / 1000));
    const uploadAttempt = uploadAttemptRef.current + 1;
    uploadAttemptRef.current = uploadAttempt;
    uploadStateRef.current = "uploading";
    setUploadState("uploading");
    setErrorText(null);

    const isCurrentUpload = () =>
      isMountedRef.current && uploadAttemptRef.current === uploadAttempt;

    const upload = uploadRecap ?? uploadWithAuth;

    try {
      const fileInfo = await waitForRecordingFile(
        fileUri,
        RECORDING_FILE_WAIT_MS,
      );
      if (!fileInfo) {
        if (!isCurrentUpload()) return;
        uploadStateRef.current = "idle";
        setUploadState("idle");
        setErrorText("Recording file not found. Please restart and try again.");
        if (__DEV__) {
          console.log("VoiceCaptureScreen upload missing file", {
            fileUri,
            stopStatus: recordingStatusRef.current,
            recordingUri: recordingUriRef.current,
            audioStateUrl: audioState.url,
            recorderUri: recorder.uri ?? null,
          });
        }
        return;
      }
      const rawFileSize = fileInfo.exists ? Number(fileInfo.size) : 0;
      const fileSizeBytes =
        Number.isFinite(rawFileSize) && rawFileSize > 0 ? rawFileSize : 1;
      const fileName = fileUri.split("/").pop() ?? "recap.m4a";
      const mimeType = fileName.endsWith(".wav")
        ? "audio/wav"
        : fileName.endsWith(".mp3")
          ? "audio/mpeg"
          : "audio/mp4";

      const result = await upload({
        clinicId,
        patientId,
        mimeType,
        fileName,
        fileSizeBytes,
        durationSeconds: durationToPersistSeconds,
      });
      if (!isCurrentUpload()) return;

      await uploadBinaryToPresignedUrl(result.uploadUrl, fileUri, mimeType);
      if (!isCurrentUpload()) return;

      const completed = completeUpload
        ? await completeUpload(result)
        : await completeUploadWithAuth(result, durationToPersistSeconds);
      if (!isCurrentUpload()) return;
      pausePlaybackIfPlaying(playbackPlayer, playbackStatus);
      await cleanupRecordingFile();
      if (!isCurrentUpload()) return;
      setUploadId(completed.uploadId);
      uploadStateRef.current = "uploaded";
      setUploadState("uploaded");
      onUploadComplete?.(completed);
    } catch (error) {
      if (!isCurrentUpload()) return;
      // If consent is required, show consent UI instead of generic error
      if (error instanceof Error && error.message === "patient_consent_required") {
        uploadStateRef.current = "idle";
        setUploadState("idle");
        setConsentState("required");
        return;
      }
      uploadStateRef.current = "idle";
      setUploadState("idle");
      setErrorText(
        getUserSafeErrorMessage(error, "We couldn't upload the recording. Please try again."),
      );
    } finally {
      if (!isMountedRef.current) {
        await deleteRecordingFile(fileUri);
      }
    }
  }

  async function handleRestart(): Promise<void> {
    pausePlaybackIfPlaying(playbackPlayer, playbackStatus);
    if (recorderStateRef.current === "recording" || recorderStateRef.current === "paused") {
      await recorder.stop().catch(() => undefined);
    }
    await cleanupRecordingFile();
    recordingStatusRef.current = null;
    setRecorderState("idle");
    recorderStateRef.current = "idle";
    uploadStateRef.current = "idle";
    setUploadState("idle");
    setUploadId(null);
    setErrorText(null);
    setConsentState("not_required");
  }

  function confirmRestart(): void {
    if (uploadStateRef.current === "uploading") {
      Alert.alert(
        "Upload in progress",
        "Keep this screen open until the recording finishes uploading.",
      );
      return;
    }
    Alert.alert(
      "Discard recording?",
      "This deletes the recorded recap from this phone and starts over.",
      [
        { text: "Keep recording", style: "cancel" },
        {
          text: "Discard & Restart",
          style: "destructive",
          onPress: () => void handleRestart(),
        },
      ],
    );
  }

  async function handleDiscardAndLeave(): Promise<void> {
    pausePlaybackIfPlaying(playbackPlayer, playbackStatus);
    if (recorderStateRef.current === "recording" || recorderStateRef.current === "paused") {
      await recorder.stop().catch(() => undefined);
    }
    await cleanupRecordingFile();
    recordingStatusRef.current = null;
    recorderStateRef.current = "idle";
    setRecorderState("idle");
    onBack?.();
  }

  async function handlePlaybackToggle(): Promise<void> {
    if (playbackStatus?.playing) {
      playbackPlayer.pause();
      return;
    }

    if (playbackStatus?.playbackState === "ended" || playbackStatus?.didJustFinish) {
      await playbackPlayer.seekTo(0);
    }

    playbackPlayer.play();
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <MeridianScreenHeader
          title="Audio Capture"
          {...(onBack ? { onBack: requestBack, backTestID: "voice-capture-back-button" } : {})}
          variant="task"
        />
      </View>

      {displayName ? (
        <View style={styles.patientCard} testID="voice-capture-patient-context">
          <View style={styles.patientCardContent}>
            <Text style={styles.patientEyebrow}>Patient</Text>
            <Text style={styles.patientName}>{displayName}</Text>
          </View>
          {displayCondition ? <Text style={styles.conditionPill}>{displayCondition}</Text> : null}
        </View>
      ) : null}

      <View style={styles.focalArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recorderState === "idle" ? "Start recording" : "Recording in progress"}
          testID="voice-capture-mic-button"
          onPress={() => {
            if (recorderState === "idle") {
              void handleStartRecording();
            }
          }}
          style={({ pressed }) => [
            styles.micButton,
            recorderState !== "idle" && styles.micButtonActive,
            pressed && recorderState === "idle" && styles.pressed,
          ]}
        >
          <Mic color={recorderState === "idle" ? meridian.color.primary : meridian.color.surface} size={32} />
        </Pressable>

        <Text style={styles.timer}>{formatTime(durationSeconds)}</Text>
        <View style={styles.recordingState}>
          <View style={[styles.stateDot, recorderState === "recording" ? styles.stateDotActive : null]} />
          <Text style={styles.statusLabel}>{statusLabel}</Text>
        </View>

        <View style={styles.waveformRow}>
          {waveformBars.map((height, index) => (
            <View
              key={WAVEFORM_BAR_KEYS[index] ?? `wave-static-${height}`}
              style={[
                styles.waveBar,
                { height },
                recorderState === "recording" && index % 3 === 0 && styles.waveBarActive,
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.controls}>
        {recorderState === "idle" && (
          <MeridianButton
            label="Start Recording"
            onPress={() => {
              void handleStartRecording();
            }}
            testID="voice-capture-start-recording-button"
          />
        )}

        {(recorderState === "recording" || recorderState === "paused") && (
          <View style={styles.controlStack}>
            <MeridianButton
              label="Stop & Process Note"
              onPress={() => {
                void handleStop();
              }}
              testID="voice-capture-stop-button"
            />
            <View style={styles.controlRow}>
              <View style={styles.controlCell}>
                {recorderState === "recording" ? (
                  <MeridianButton
                    label="Pause"
                    variant="secondary"
                    onPress={handlePause}
                    testID="voice-capture-pause-button"
                  />
                ) : (
                  <MeridianButton
                    label="Resume"
                    variant="secondary"
                    onPress={handleResume}
                    testID="voice-capture-resume-button"
                  />
                )}
              </View>
              <View style={styles.controlCell}>
                <MeridianButton
                  label="Restart"
                  variant="secondary"
                  onPress={confirmRestart}
                  testID="voice-capture-restart-button"
                />
              </View>
            </View>
          </View>
        )}

        {recorderState === "stopped" && (consentState === "required" || consentState === "confirming") && (
          <View style={styles.controlStack}>
            <Text style={[typography.label, styles.consentText]}>
              This patient does not have active recording/AI processing consent on file.
              Please confirm that the patient has consented to recording and AI documentation.
            </Text>
            <MeridianButton
              label={consentState === "confirming" ? "Confirming..." : "Confirm Consent"}
              disabled={consentState === "confirming"}
              onPress={() => {
                void confirmConsentAndUpload();
              }}
              testID="voice-capture-consent-confirm-button"
            />
            <MeridianButton
              label="Discard & Restart"
              variant="ghost"
              onPress={confirmRestart}
              testID="voice-capture-discard-button"
            />
          </View>
        )}

        {recorderState === "stopped" && consentState === "not_required" && (
          <View style={styles.controlStack}>
            <MeridianButton
              label={playbackStatus?.playing ? "Pause recording" : "Play recording"}
              variant="secondary"
              disabled={!recordingUri}
              onPress={() => {
                void handlePlaybackToggle();
              }}
              testID="voice-capture-play-recording-button"
            />
            <MeridianButton
              label={
                uploadState === "uploading"
                  ? "Uploading..."
                  : recordingUri
                    ? "Upload Recap"
                    : "No Recording Yet"
              }
              disabled={uploadState === "uploading" || !recordingUri || !hasMinimumDuration}
              onPress={() => {
                void handleUpload();
              }}
              testID="voice-capture-upload-button"
            />
            {!hasMinimumDuration ? (
              <Text style={[typography.label, styles.helperText]}>
                Record at least {formatTime(MIN_RECAP_DURATION_SECONDS)} to enable upload.
              </Text>
            ) : null}
            <MeridianButton
              label="Discard & Restart"
              variant="ghost"
              onPress={confirmRestart}
              testID="voice-capture-discard-button"
            />
          </View>
        )}
      </View>

      {errorText ? (
        errorText === "Microphone permission denied." ? (
          <View testID="voice-capture-error-state">
            <Text style={[typography.label, styles.errorText]}>
              Microphone access is needed to record a recap.
            </Text>
            <Text style={[typography.label, styles.errorText]}>
              Allow microphone access in Android settings and try again.
            </Text>
          </View>
        ) : (
          <Text style={[typography.label, styles.errorText]}>{errorText}</Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: meridian.color.background,
    paddingHorizontal: meridian.spacing.lg,
    paddingTop: meridian.spacing.md,
    paddingBottom: meridian.spacing.lg,
    gap: meridian.spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.sm,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.heading,
    flex: 1,
    color: meridian.color.text,
    textAlign: "center",
  },
  patientCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
    paddingVertical: meridian.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: meridian.color.border,
  },
  patientCardContent: {
    flex: 1,
    gap: meridian.spacing.xs,
  },
  patientEyebrow: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  patientName: {
    ...typography.heading,
    color: meridian.color.text,
  },
  conditionPill: {
    ...typography.label,
    color: meridian.color.primary,
    backgroundColor: meridian.color.primarySoft,
    borderRadius: 999,
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
  },
  focalArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xl,
  },
  micButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonActive: {
    backgroundColor: meridian.color.primary,
  },
  timer: {
    ...typography.display,
    color: meridian.color.text,
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  recordingState: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.xs,
    minHeight: 24,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: meridian.color.border,
  },
  stateDotActive: {
    backgroundColor: meridian.color.primary,
  },
  statusLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  waveformRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    height: 44,
    gap: 4,
    width: "100%",
    paddingHorizontal: meridian.spacing.md,
  },
  waveBar: {
    width: 6,
    borderRadius: 3,
    backgroundColor: meridian.color.border,
  },
  waveBarActive: {
    backgroundColor: meridian.color.primary,
  },
  controls: {
    gap: meridian.spacing.md,
  },
  controlStack: {
    gap: meridian.spacing.sm,
  },
  controlRow: {
    flexDirection: "row",
    gap: meridian.spacing.sm,
  },
  controlCell: {
    flex: 1,
  },
  errorText: {
    color: meridian.color.destructive,
    textAlign: "center",
  },
  helperText: {
    color: meridian.color.textSubtle,
    textAlign: "center",
  },
  consentText: {
    color: meridian.color.text,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
});
