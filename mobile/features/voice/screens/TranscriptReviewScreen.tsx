import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Play, Pause, Trash2 } from "lucide-react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import type {
  TranscriptSegment,
  TranscriptWord,
  VoicePipelineStageState,
  VoiceTranscriptResponse,
} from "../../../../shared/contracts/voice";
import { useTranscriptReview } from "../hooks/useTranscriptReview";
import { useSaveTranscriptEdit } from "../hooks/useSaveTranscriptEdit";
import { useRetryVoiceJob, useVoiceJobStatus } from "../hooks/useVoiceJobs";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function toTranscriptWords(transcript: VoiceTranscriptResponse | null): TranscriptWord[] {
  if (!transcript) {
    return [];
  }

  return transcript.segments.flatMap((segment) => segment.words);
}

function findHighlightedWordIndex(
  words: TranscriptWord[],
  playbackPositionMs: number,
): number | null {
  if (words.length === 0) {
    return null;
  }

  const rawIndex = words.findIndex(
    (word) => playbackPositionMs >= word.startMs && playbackPositionMs <= word.endMs,
  );

  if (rawIndex < 0 || rawIndex >= words.length) {
    return null;
  }

  return rawIndex;
}

function getFailurePresentation(
  stageState: VoicePipelineStageState | undefined,
  _errorMessage: string | null | undefined,
): {
  title: string;
  message: string;
  retryLabel: string;
} {
  if (stageState === "soap_failed") {
    return {
      title: "SOAP generation failed",
      message:
        "The transcript is ready, but SOAP generation could not finish. Please try again.",
      retryLabel: "Retry SOAP Generation",
    };
  }

  if (stageState === "summary_failed") {
    return {
      title: "Patient summary failed",
      message:
        "The note was created, but patient summary generation could not finish. Please try again.",
      retryLabel: "Retry Patient Summary",
    };
  }

  return {
    title: "Transcription failed",
    message: "Transcription could not finish. Please try again.",
    retryLabel: "Retry Transcription",
  };
}

type TranscriptReviewScreenProps = {
  clinicId: string;
  jobId: string;
  onBack?: () => void;
  onGenerateSoap: (transcriptText: string) => void;
  onDeleteRecording?: () => void;
};

function SegmentBlock({
  segment,
  highlightedWordIndex,
  globalWordOffset,
}: {
  segment: TranscriptSegment;
  highlightedWordIndex: number | null;
  globalWordOffset: number;
}): React.JSX.Element {
  const speaker = segment.speaker ?? "Clinician";

  return (
    <View style={styles.segmentBlock}>
      <View style={styles.segmentHeader}>
        <Text style={styles.segmentSpeaker}>{speaker}</Text>
        <Text style={styles.segmentTimestamp}>{formatMs(segment.startMs)}</Text>
      </View>
      <View style={styles.segmentBody}>
        {segment.words.length > 0 ? segment.words.map((word, index) => {
          const globalIndex = globalWordOffset + index;
          const isHighlighted = highlightedWordIndex === globalIndex;
          return (
            <Text
              key={`${globalIndex}-${word.startMs}`}
              accessibilityLabel={
                isHighlighted ? "Highlighted transcript word" : "Transcript word"
              }
              style={[
                styles.word,
                isHighlighted && styles.highlightedWord,
              ]}
            >
              {word.text}{" "}
            </Text>
          );
        }) : (
          <Text style={styles.word}>{segment.text}</Text>
        )}
      </View>
    </View>
  );
}

export function TranscriptReviewScreen({
  clinicId,
  jobId,
  onBack,
  onGenerateSoap,
  onDeleteRecording,
}: TranscriptReviewScreenProps): React.JSX.Element {
  const jobStatusQuery = useVoiceJobStatus(clinicId, jobId);
  const {
    transcript,
    isLoading,
    isReady,
    audioUrl,
    refetch: refetchTranscript,
  } = useTranscriptReview(clinicId, jobId);
  const { retryVoiceJob, isPending: isRetryingJob } = useRetryVoiceJob(clinicId);

  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [localPositionMs, setLocalPositionMs] = useState(0);
  const [hasSubmittedSoap, setHasSubmittedSoap] = useState(false);
  const hasSubmittedSoapRef = useRef(false);
  const hasInitialized = useRef(false);
  const prevJobId = useRef(jobId);

  const resolvedAudioUrl = useMemo(() => {
    if (!audioUrl) return null;
    return audioUrl.startsWith("/") ? `${resolveApiBaseUrl()}${audioUrl}` : audioUrl;
  }, [audioUrl]);

  const player = useAudioPlayer(resolvedAudioUrl, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const {
    mutateAsync: saveTranscriptEdit,
    isPending: isSaving,
  } = useSaveTranscriptEdit();

  const totalDurationMs = useMemo(() => {
    if (!transcript || transcript.segments.length === 0) return 0;
    const lastSegment = transcript.segments[transcript.segments.length - 1];
    if (!lastSegment) return 0;
    if (lastSegment.words.length === 0) return lastSegment.endMs;
    return lastSegment.words[lastSegment.words.length - 1]?.endMs ?? lastSegment.endMs;
  }, [transcript]);

  const displaySegments = useMemo(() => {
    if (!transcript) {
      return [];
    }

    if (transcript.speakerMode !== "single" || transcript.segments.length <= 1) {
      return transcript.segments;
    }

    const mergedWords = transcript.segments.flatMap((segment) => segment.words);
    const mergedText =
      transcript.text.trim().length > 0
        ? transcript.text.trim()
        : transcript.segments
            .flatMap((segment) => {
              const text = segment.text.trim();
              return text ? [text] : [];
            })
            .join(" ");
    const firstSegment = transcript.segments[0];
    const lastSegment = transcript.segments[transcript.segments.length - 1];

    return [
      {
        startMs: firstSegment?.startMs ?? 0,
        endMs: lastSegment?.endMs ?? firstSegment?.startMs ?? 0,
        text: mergedText,
        words: mergedWords,
        speaker: "Clinician",
      },
    ];
  }, [transcript]);

  const transcriptWords = useMemo(() => toTranscriptWords(transcript), [transcript]);
  const highlightedWordIndex = useMemo(
    () => findHighlightedWordIndex(transcriptWords, localPositionMs),
    [localPositionMs, transcriptWords],
  );

  if (prevJobId.current !== jobId) {
    prevJobId.current = jobId;
    hasInitialized.current = false;
    hasSubmittedSoapRef.current = false;
    setHasSubmittedSoap(false);
  }

  if (transcript?.text && !hasInitialized.current && !isEditing && editedText !== transcript.text) {
    setEditedText(transcript.text);
    hasInitialized.current = true;
  }

  useEffect(() => {
    if (!status) {
      setLocalPositionMs(0);
      return;
    }

    if (status.didJustFinish) {
      player.pause();
      setLocalPositionMs(0);
      return;
    }

    if (status.playing) {
      setLocalPositionMs(Math.min(Math.round(status.currentTime * 1000), totalDurationMs));
    }
  }, [status, totalDurationMs, player]);

  useEffect(() => {
    const stageState = jobStatusQuery.data?.stageState;
    if (!transcript && stageState && stageState !== "transcription_failed") {
      void refetchTranscript();
    }
  }, [jobStatusQuery.data?.stageState, refetchTranscript, transcript]);

  const progress = totalDurationMs > 0 ? localPositionMs / totalDurationMs : 0;
  const failurePresentation =
    jobStatusQuery.data?.status === "failed"
      ? getFailurePresentation(
          jobStatusQuery.data.stageState,
          jobStatusQuery.data.errorMessage,
        )
      : null;

  const globalWordOffsets = useMemo(() => {
    if (displaySegments.length === 0) return [];
    const offsets: number[] = [];
    let count = 0;
    for (const segment of displaySegments) {
      offsets.push(count);
      count += segment.words.length;
    }
    return offsets;
  }, [displaySegments]);

  const hasUnsavedEdits =
    isEditing && editedText !== (transcript?.text ?? "");

  function requestBack(): void {
    if (isSaving) {
      Alert.alert(
        "Saving transcript",
        "Keep this screen open until your transcript changes are saved.",
      );
      return;
    }

    if (hasUnsavedEdits) {
      Alert.alert(
        "Discard transcript changes?",
        "Your unsaved transcript edits will be lost.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard changes",
            style: "destructive",
            onPress: () => {
              setEditedText(transcript?.text ?? "");
              setIsEditing(false);
              onBack?.();
            },
          },
        ],
      );
      return;
    }

    onBack?.();
  }

  useEffect(() => {
    if (!onBack) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestBack();
      return true;
    });
    return () => subscription.remove();
  }, [editedText, hasUnsavedEdits, isSaving, isEditing, onBack, transcript?.text]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <MeridianScreenHeader
          title="Session Audio Review"
          subtitle="Confirm the transcript before generating the note."
          {...(onBack ? { onBack: requestBack, backTestID: "transcript-review-back-button" } : {})}
          variant="task"
        />
      </View>

      <View style={styles.playerCard}>
        <View style={styles.playerHeader}>
          <Text style={styles.playerMeta}>
            Audio Source: Session{totalDurationMs > 0 ? `, ${formatMs(totalDurationMs)}` : ""}
          </Text>
        </View>
        <View style={styles.playerBody}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={status?.playing ? "Pause playback" : "Start playback"}
            testID="transcript-review-play-button"
            accessibilityState={{ disabled: !audioUrl }}
            disabled={!audioUrl}
            onPress={() => {
              if (status?.playing) {
                player.pause();
              } else {
                player.play();
              }
            }}
            style={({ pressed }) => [
              styles.playButton,
              pressed && styles.pressed,
              !audioUrl && styles.playButtonDisabled,
            ]}
          >
            {status?.playing ? (
              <Pause color={meridian.color.surface} size={20} />
            ) : (
              <Play color={meridian.color.surface} size={20} />
            )}
          </Pressable>
          <View style={styles.progressShell}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatMs(localPositionMs)}</Text>
              <Text style={styles.timeText}>{formatMs(totalDurationMs)}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView style={styles.transcriptScroll} contentContainerStyle={styles.transcriptContent}>
        {failurePresentation ? (
          <View style={styles.failureCard}>
            <Text style={styles.failureTitle}>{failurePresentation.title}</Text>
            <Text style={styles.failureText}>{failurePresentation.message}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={failurePresentation.retryLabel}
              testID="transcript-review-retry-transcription-button"
              accessibilityState={{ disabled: isRetryingJob }}
              disabled={isRetryingJob}
              onPress={async () => {
                try {
                  await retryVoiceJob({ jobId });
                } catch {
                  Alert.alert("Retry Failed", "Could not retry transcription. Please try again.");
                } finally {
                  await jobStatusQuery.refetch();
                }
              }}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && !isRetryingJob && styles.pressed,
                isRetryingJob && styles.retryButtonDisabled,
              ]}
            >
              <Text style={styles.retryButtonText}>
                {isRetryingJob ? "Retrying..." : failurePresentation.retryLabel}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading && <Text style={styles.emptyText}>Loading transcript...</Text>}

        {!isLoading && !transcript && (
          <Text style={styles.emptyText}>
            {jobStatusQuery.data?.stageState === "transcription_failed"
              ? "Transcript unavailable."
              : "Waiting for transcript..."}
          </Text>
        )}

        {!isLoading && transcript && isEditing && (
          <TextInput
            accessibilityLabel="Edit transcript text"
            testID="transcript-review-edit-input"
            multiline
            value={editedText}
            onChangeText={setEditedText}
            style={styles.editInput}
          />
        )}

        {!isLoading &&
          transcript &&
          !isEditing &&
          displaySegments.map((segment, index) => (
            <SegmentBlock
              key={`${segment.startMs}-${segment.endMs}-${segment.speaker ?? "clinician"}`}
              segment={segment}
              highlightedWordIndex={highlightedWordIndex}
              globalWordOffset={globalWordOffsets[index] ?? 0}
            />
          ))}
      </ScrollView>

      <View style={styles.actionBar}>
        {transcript ? (
          isEditing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save"
              testID="transcript-review-save-button"
              accessibilityState={{ disabled: isSaving }}
              disabled={isSaving}
              onPress={async () => {
                try {
                  await saveTranscriptEdit({
                    jobId,
                    clinicId,
                    transcriptText: editedText,
                  });
                  setIsEditing(false);
                } catch {
                  Alert.alert("Save Failed", "Could not save transcript changes. Please try again.");
                }
              }}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && !isSaving && styles.pressed,
                isSaving && styles.secondaryActionDisabled,
              ]}
            >
              <Text style={styles.secondaryActionText}>
                {isSaving ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit Transcript"
              testID="transcript-review-edit-button"
              onPress={() => setIsEditing(true)}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryActionText}>Edit Transcript</Text>
            </Pressable>
          )
        ) : (
          <View style={styles.secondaryActionPlaceholder} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate SOAP Note"
          accessibilityHint="Creates one SOAP draft from this confirmed transcript."
          testID="transcript-review-generate-soap-button"
          accessibilityState={{ disabled: !isReady || hasSubmittedSoap }}
          disabled={!isReady || hasSubmittedSoap}
          onPress={() => {
            if (isReady && !hasSubmittedSoapRef.current) {
              hasSubmittedSoapRef.current = true;
              setHasSubmittedSoap(true);
              onGenerateSoap(editedText);
            }
          }}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed && isReady && !hasSubmittedSoap && styles.pressed,
            (!isReady || hasSubmittedSoap) && styles.primaryActionDisabled,
          ]}
        >
          <Text style={styles.primaryActionText}>Generate SOAP Note</Text>
        </Pressable>
      </View>

      {onDeleteRecording ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete Recording"
          testID="transcript-review-delete-button"
          onPress={() => {
            Alert.alert(
              "Delete Recording",
              "Delete recording and transcript permanently? This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: onDeleteRecording,
                },
              ],
            );
          }}
          style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}
        >
          <Trash2 color={meridian.color.destructive} size={18} />
          <Text style={styles.deleteActionText}>Delete Recording</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: meridian.color.background,
    padding: meridian.spacing.md,
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
  playerCard: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
    ...meridian.shadow.card,
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontSize: 12,
  },
  playerBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.md,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: meridian.color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonDisabled: {
    opacity: 0.5,
  },
  progressShell: {
    flex: 1,
    gap: meridian.spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: meridian.color.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: meridian.color.primary,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeText: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontSize: 12,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContent: {
    gap: meridian.spacing.md,
    paddingBottom: meridian.spacing.md,
  },
  segmentBlock: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
    ...meridian.shadow.card,
  },
  segmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segmentSpeaker: {
    ...typography.label,
    color: meridian.color.primary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontSize: 12,
  },
  segmentTimestamp: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontSize: 12,
  },
  segmentBody: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  word: {
    ...typography.body,
    color: meridian.color.text,
  },
  highlightedWord: {
    backgroundColor: meridian.color.primarySoft,
    color: meridian.color.primary,
  },
  emptyText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  failureCard: {
    borderRadius: meridian.radius.card,
    borderWidth: 1,
    borderColor: meridian.color.errorBorder,
    backgroundColor: meridian.color.errorSurface,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
  },
  failureTitle: {
    ...typography.label,
    color: meridian.color.destructive,
  },
  failureText: {
    ...typography.body,
    color: meridian.color.destructive,
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: meridian.touchTarget.hit,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.primary,
    paddingHorizontal: meridian.spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonText: {
    ...typography.label,
    color: meridian.color.surface,
  },
  actionBar: {
    flexDirection: "row",
    gap: meridian.spacing.sm,
    paddingTop: meridian.spacing.sm,
  },
  secondaryAction: {
    flex: 1,
    minHeight: meridian.touchTarget.hit,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionDisabled: {
    opacity: 0.5,
  },
  secondaryActionPlaceholder: {
    flex: 1,
  },
  secondaryActionText: {
    ...typography.label,
    color: meridian.color.primary,
    fontSize: 16,
  },
  primaryAction: {
    flex: 2,
    minHeight: meridian.touchTarget.hit,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionDisabled: {
    opacity: 0.5,
  },
  primaryActionText: {
    ...typography.label,
    color: meridian.color.surface,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  deleteAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: meridian.spacing.sm,
    minHeight: meridian.touchTarget.hit,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.errorSurface,
    borderWidth: 1,
    borderColor: meridian.color.errorBorder,
    paddingHorizontal: meridian.spacing.md,
  },
  deleteActionText: {
    ...typography.label,
    color: meridian.color.destructive,
    fontSize: 16,
  },
  editInput: {
    ...typography.body,
    color: meridian.color.text,
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    minHeight: 120,
    textAlignVertical: "top",
  },
});
