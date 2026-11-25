import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { MeridianInput, MeridianButton, MeridianStatusPill, StatusPillType } from "../../ui/meridian/primitives";

import type {
  ConditionTemplate,
  SoapSections,
  TemplateKey,
  TemplateApplyMode,
  TemplateProvenanceSnapshot,
} from "../../../../shared/contracts/notes";
import type { CopyForwardScaffold, NoteStatus } from "../../../../shared/contracts/sessions";
import { usePatientList, usePatientProfile } from "../../patients/hooks/usePatients";
import {
  useConditionTemplates,
  useCreateManualNote,
  useFinalizeManualNote,
  useManualNote,
  useReopenManualNote,
  useSaveManualNote,
} from "../hooks/useNotes";
import {
  useGenerateSoapDraft,
  useRegenerateSoapSection,
} from "../../voice/hooks/useSoapGeneration";
import {
  useGeneratePatientSummary,
  useSavePatientSummary,
} from "../../voice/hooks/usePatientSummary";
import {
  saveDraft,
  getDraft,
  findDraftByIdPrefix,
  clearDraft,
  saveQueuedChange,
  removeQueuedNoteEditsForSession,
} from "../../offline/storage/queueStore";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { getUserSafeErrorMessage } from "../../ui/userFacingErrors";

export type ComposerEntryMode = "capture" | "review" | "finish";
export type DocumentationSource = "ai" | "voice" | "manual" | "template";

type ManualSoapComposerScreenProps = {
  initialPatientId?: string;
  initialSessionId?: string;
  initialEntryMode?: ComposerEntryMode;
  initialSource?: DocumentationSource;
  initialTemplateKey?: TemplateKey | null;
  initialTranscriptText?: string;
  copyForwardScaffold?: CopyForwardScaffold;
  copyForwardToken?: string;
  onCopyForwardScaffoldHandled?: (token: string) => void;
  soapGenerationRequest?: { id: string; transcriptText: string };
  onSoapGenerationRequestHandled?: (requestId: string) => void;
  onBack?: () => void;
  onStartVoiceCapture?: () => void;
  onOpenExportShare?: (input: {
    patientId: string;
    sessionId: string;
    noteStatus: NoteStatus;
    patientSummary: string;
    sections: {
      subjective: string;
      objective: string;
      assessment: string;
      plan: string;
    };
  }) => void;
  onViewHistory?: (sessionId: string) => void;
};

type SoapDraft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type NoteMetaState = {
  noteStatus: NoteStatus;
  selectedTemplateKey: TemplateKey | null;
};

type PendingAction = "finalize" | "reopen" | null;
type FeedbackTone = "success" | "error";
type ComposerStage = "capture" | "review" | "finish";
type SoapSectionKey = keyof SoapDraft;
type DraftSaveOutcome = "saved" | "queued" | "failed";

const DEFAULT_VISIT_TYPE = "manual SOAP note";

const SOAP_SECTION_META: Record<SoapSectionKey, { badge: string; title: string; placeholder: string }> = {
  subjective: {
    badge: "S",
    title: "Subjective",
    placeholder: "Symptoms, concerns, and patient report",
  },
  objective: {
    badge: "O",
    title: "Objective",
    placeholder: "Observed movement, measurements, and findings",
  },
  assessment: {
    badge: "A",
    title: "Assessment",
    placeholder: "Clinical reasoning and progress",
  },
  plan: {
    badge: "P",
    title: "Plan",
    placeholder: "Next visit, exercises, and follow-up",
  },
};

function createQueueChangeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createManualDraftId(patientId: string, localDraftId: string): string {
  return `manual-note-draft:${patientId}:${localDraftId}`;
}

function getLocalDraftIdForPatient(patientId: string): string {
  const draftPrefix = `manual-note-draft:${patientId}:`;
  const existingDraft = safelyFindDraftByIdPrefix(draftPrefix);
  return existingDraft?.draftId.slice(draftPrefix.length) || createQueueChangeId();
}

function isOfflineLikeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/Network/i.test(error.message) ||
      /fetch/i.test(error.message) ||
      /offline/i.test(error.message))
  );
}

async function isOnlineForSave(): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  const { getConnectivityState } = await import("../../offline/services/connectivity");
  return getConnectivityState();
}

const EMPTY_DRAFT: SoapDraft = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

function draftFromSections(sections?: SoapSections | null): SoapDraft {
  return {
    subjective: sections?.subjective ?? "",
    objective: sections?.objective ?? "",
    assessment: sections?.assessment ?? "",
    plan: sections?.plan ?? "",
  };
}

function draftFromGeneratedSections(sections?: SoapSections | null): SoapDraft {
  const draft = draftFromSections(sections);

  return Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [
      key,
      value.trim().toLowerCase() === "not mentioned" ? "" : value,
    ]),
  ) as SoapDraft;
}

function draftFromCopyForwardScaffold(scaffold: CopyForwardScaffold): SoapDraft {
  return {
    subjective: scaffold.carryForwardContext ?? "",
    objective: "",
    assessment: "",
    plan: scaffold.priorPlan ?? "",
  };
}

function sectionsFromDraft(draft: SoapDraft): SoapSections {
  return {
    subjective: draft.subjective.trim().length > 0 ? draft.subjective.trim() : null,
    objective: draft.objective.trim().length > 0 ? draft.objective.trim() : null,
    assessment: draft.assessment.trim().length > 0 ? draft.assessment.trim() : null,
    plan: draft.plan.trim().length > 0 ? draft.plan.trim() : null,
  };
}

function draftsMatch(left: SoapDraft, right: SoapDraft): boolean {
  return (
    left.subjective === right.subjective &&
    left.objective === right.objective &&
    left.assessment === right.assessment &&
    left.plan === right.plan
  );
}

function safelySaveDraft(draftId: string, sections: SoapSections): boolean {
  try {
    saveDraft(draftId, sections);
    return true;
  } catch {
    return false;
  }
}

function safelyGetDraft(draftId: string) {
  try {
    return getDraft(draftId);
  } catch {
    return null;
  }
}

function safelyFindDraftByIdPrefix(draftPrefix: string) {
  try {
    return findDraftByIdPrefix(draftPrefix);
  } catch {
    return null;
  }
}

function safelyClearDraft(draftId: string): void {
  try {
    clearDraft(draftId);
  } catch {
    // Local storage can be unavailable; keep the editor usable.
  }
}

export function formatTemplateProvenanceLabel(
  template: Pick<ConditionTemplate, "label" | "source" | "categories" | "category"> | null,
  templateKey: string | null,
  snapshot?: TemplateProvenanceSnapshot | null,
): string {
  if (snapshot?.templateLabel) {
    const sourceLabel = snapshot.source === "custom" ? "Custom" : "Built-in";
    const categories = snapshot.categoryLabels.length
      ? ` • ${snapshot.categoryLabels.join(", ")}`
      : "";
    return `${sourceLabel} • ${snapshot.templateLabel}${categories}`;
  }

  if (template) {
    const sourceLabel = template.source === "custom" ? "Custom" : "Built-in";
    const categories = template.categories ?? [template.category];
    return `${sourceLabel} • ${template.label} • ${categories.join(", ")}`;
  }

  if (templateKey) {
    return "Previously applied template";
  }

  return "No template applied";
}

function statusLabel(status?: NoteStatus): string {
  if (status === "finalized") {
    return "Finalized";
  }

  if (status === "reopened") {
    return "Reopened";
  }

  return "Draft";
}

function noteProgressLabel(status: NoteStatus, hasDraftContent: boolean): string {
  if (status === "finalized") {
    return "Finalized note";
  }

  if (status === "reopened") {
    return "Reopened draft";
  }

  if (hasDraftContent) {
    return "Draft in progress";
  }

  return "Not started";
}

function hasSectionContent(sections?: SoapSections | null): boolean {
  return Boolean(
    sections && Object.values(sections).some((value) => value?.trim().length),
  );
}

function PatientPill({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      focusable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.patientRow,
        active ? styles.patientRowActive : null,
        pressed ? styles.patientRowPressed : null,
      ]}
    >
      <Text style={styles.patientName}>{label}</Text>
      <Text style={active ? styles.patientMetaActive : styles.patientMeta}>
        {active ? "Selected" : "Tap to select"}
      </Text>
    </Pressable>
  );
}

function SoapSectionRow({
  section,
  value,
  disabled,
  onPress,
}: {
  section: SoapSectionKey;
  value: string;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const meta = SOAP_SECTION_META[section];
  const preview = value.trim() || meta.placeholder;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${meta.title}`}
      disabled={disabled}
      focusable={!disabled}
      onPress={onPress}
      testID={`note-${section}-row`}
      style={({ pressed }) => [
        styles.soapSectionRow,
        pressed ? styles.pressed : null,
        disabled ? styles.soapSectionRowDisabled : null,
      ]}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{meta.badge}</Text>
      </View>
      <View style={styles.soapSectionRowCopy}>
        <Text style={styles.sectionCardTitle}>{meta.title}</Text>
        <Text numberOfLines={1} style={styles.soapSectionPreview}>{preview}</Text>
      </View>
      <Text style={styles.soapSectionChevron}>›</Text>
    </Pressable>
  );
}

export function ManualSoapComposerScreen({
  initialPatientId = "",
  initialSessionId = "",
  initialTemplateKey = null,
  initialEntryMode = initialTemplateKey ? "review" : "capture",
  initialSource = initialTemplateKey ? "template" : "ai",
  initialTranscriptText = "",
  copyForwardScaffold,
  copyForwardToken,
  onCopyForwardScaffoldHandled,
  soapGenerationRequest,
  onSoapGenerationRequestHandled,
  onBack,
  onStartVoiceCapture,
  onOpenExportShare,
  onViewHistory,
}: ManualSoapComposerScreenProps): React.JSX.Element {
  const [selectedPatientId, setSelectedPatientId] = useState(() => initialPatientId.trim());
  const [patientSearch, setPatientSearch] = useState("");
  const [noteSessionId, setNoteSessionId] = useState(() => initialSessionId.trim());
  const [draft, setDraft] = useState<SoapDraft>(() =>
    copyForwardScaffold ? draftFromCopyForwardScaffold(copyForwardScaffold) : EMPTY_DRAFT,
  );
  const [noteMeta, setNoteMeta] = useState<NoteMetaState>(() => ({
    noteStatus: "draft",
    selectedTemplateKey: copyForwardScaffold ? null : initialTemplateKey,
  }));
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingDraftReplacement, setPendingDraftReplacement] = useState(false);
  const [selectedTemplateMode, setSelectedTemplateMode] =
    useState<TemplateApplyMode>(() => (initialTemplateKey ? "replaceAll" : "fillBlank"));
  const [transcriptText, setTranscriptText] = useState(initialTranscriptText);
  const [regenerationHint, setRegenerationHint] = useState("");
  const [patientSummary, setPatientSummary] = useState("");
  const [savedPatientSummary, setSavedPatientSummary] = useState("");
  const [isPatientSummaryDirty, setIsPatientSummaryDirty] = useState(false);
  const [isSummaryDiscardVisible, setIsSummaryDiscardVisible] = useState(false);
  const [isSummaryReplacementVisible, setIsSummaryReplacementVisible] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("success");
  const [selectedSource, setSelectedSource] = useState<DocumentationSource>(initialSource);
  const [composerStage, setComposerStage] = useState<ComposerStage>(initialEntryMode);
  const [hasStartedNote, setHasStartedNote] = useState(initialEntryMode !== "capture");
  const [activeSection, setActiveSection] = useState<SoapSectionKey | null>(null);

  const patientListQuery = usePatientList({ query: patientSearch });
  const selectedPatientProfileQuery = usePatientProfile(selectedPatientId);
  const templateListQuery = useConditionTemplates();
  const noteQuery = useManualNote(selectedPatientId, noteSessionId);
  const createManualNote = useCreateManualNote();
  const saveManualNote = useSaveManualNote();
  const finalizeManualNote = useFinalizeManualNote();
  const reopenManualNote = useReopenManualNote();
  const generateSoapDraft = useGenerateSoapDraft();
  const regenerateSoapSection = useRegenerateSoapSection();
  const generatePatientSummary = useGeneratePatientSummary();
  const savePatientSummary = useSavePatientSummary();
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<SoapDraft>(draft);
  const [localDraftId, setLocalDraftId] = useState(() =>
    copyForwardScaffold
      ? createQueueChangeId()
      : initialPatientId
        ? getLocalDraftIdForPatient(initialPatientId)
        : createQueueChangeId(),
  );
  const skipDraftSaveIdsRef = useRef<Set<string> | null>(null);
  if (skipDraftSaveIdsRef.current === null) {
    skipDraftSaveIdsRef.current = new Set<string>();
  }
  const skipDraftSaveIds = skipDraftSaveIdsRef.current;
  draftRef.current = draft;
  const noteStatus = noteMeta.noteStatus;
  const selectedTemplateKey = noteMeta.selectedTemplateKey;
  const returnsToProfileOnReviewBack =
    initialEntryMode === "review" &&
    Boolean(initialSessionId.trim()) &&
    !initialTemplateKey &&
    !copyForwardScaffold;
  const draftStorageId =
    noteSessionId ||
    (selectedPatientId ? createManualDraftId(selectedPatientId, localDraftId) : "");
  const draftHasContent = Object.values(draft).some((value) => value.trim().length > 0);
  const hydratedDraftStorageIdRef = useRef("");
  const hydratedPatientSummarySessionIdRef = useRef("");
  const shouldRestoreInitialStageRef = useRef(true);
  const previousDraftStorageIdRef = useRef(draftStorageId);
  const latestDraftStorageIdRef = useRef(draftStorageId);
  const latestNoteStatusRef = useRef(noteStatus);
  const pendingServerNoteStatusRef = useRef<NoteStatus | null>(null);
  const handledSoapGenerationRequestIdsRef = useRef(new Set<string>());
  const handledCopyForwardTokensRef = useRef(new Set<string>());
  latestDraftStorageIdRef.current = draftStorageId;
  latestNoteStatusRef.current = noteStatus;

  const lastDraftStorageIdRef = useRef(draftStorageId);
  if (lastDraftStorageIdRef.current !== draftStorageId) {
    lastDraftStorageIdRef.current = draftStorageId;
    hydratedDraftStorageIdRef.current = "";
  }

  useEffect(() => {
    if (
      !copyForwardScaffold ||
      !copyForwardToken ||
      copyForwardScaffold.patientId !== selectedPatientId ||
      handledCopyForwardTokensRef.current.has(copyForwardToken)
    ) {
      return;
    }

    skipDraftSaveIds.add(draftStorageId);
    setLocalDraftId(createQueueChangeId());
    setNoteSessionId("");
    setDraft(draftFromCopyForwardScaffold(copyForwardScaffold));
    setNoteMeta({ noteStatus: "draft", selectedTemplateKey: null });
    setComposerStage("review");
    setHasStartedNote(true);
    hydratedDraftStorageIdRef.current = "";
    handledCopyForwardTokensRef.current.add(copyForwardToken);
    onCopyForwardScaffoldHandled?.(copyForwardToken);
  }, [
    copyForwardScaffold,
    copyForwardToken,
    draftStorageId,
    onCopyForwardScaffoldHandled,
    selectedPatientId,
  ]);

  useEffect(() => {
    const previousDraftStorageId = previousDraftStorageIdRef.current;
    if (previousDraftStorageId === draftStorageId) {
      return;
    }

    if (
      previousDraftStorageId &&
      latestNoteStatusRef.current !== "finalized" &&
      !skipDraftSaveIds.has(previousDraftStorageId)
    ) {
      safelySaveDraft(previousDraftStorageId, sectionsFromDraft(draftRef.current));
    }

    skipDraftSaveIds.delete(previousDraftStorageId);
    previousDraftStorageIdRef.current = draftStorageId;
  }, [draftStorageId, skipDraftSaveIds]);

  useEffect(() => {
    if (!draftStorageId || !noteQuery.data) {
      return;
    }

    const serverStatus = noteQuery.data.noteStatus;
    const pendingServerNoteStatus = pendingServerNoteStatusRef.current;
    if (pendingServerNoteStatus && serverStatus !== pendingServerNoteStatus) {
      return;
    }

    if (pendingServerNoteStatus === serverStatus) {
      pendingServerNoteStatusRef.current = null;
    }

    const serverTemplateKey = noteQuery.data.templateKey;
    if (
      noteMeta.noteStatus !== serverStatus ||
      noteMeta.selectedTemplateKey !== serverTemplateKey
    ) {
      setNoteMeta({
        noteStatus: serverStatus,
        selectedTemplateKey: serverTemplateKey,
      });
    }
  }, [
    draftStorageId,
    noteMeta.noteStatus,
    noteMeta.selectedTemplateKey,
    noteQuery.data,
  ]);

  useEffect(() => {
    if (
      !noteSessionId ||
      !noteQuery.data ||
      hydratedPatientSummarySessionIdRef.current === noteSessionId
    ) {
      return;
    }

    const savedSummary = noteQuery.data.patientSummary ?? "";
    setPatientSummary(savedSummary);
    setSavedPatientSummary(savedSummary);
    setIsPatientSummaryDirty(false);
    hydratedPatientSummarySessionIdRef.current = noteSessionId;
  }, [noteQuery.data, noteSessionId]);

  useEffect(() => {
    if (!shouldRestoreInitialStageRef.current || noteQuery.isLoading) {
      return;
    }

    if (initialEntryMode === "finish") {
      setComposerStage("finish");
      setHasStartedNote(true);
    } else if (
      initialEntryMode === "review" ||
      initialTemplateKey ||
      hasSectionContent(noteQuery.data?.sections) ||
      draftHasContent
    ) {
      setComposerStage("review");
      setHasStartedNote(true);
    }

    shouldRestoreInitialStageRef.current = false;
  }, [draftHasContent, initialEntryMode, initialTemplateKey, noteQuery.data?.sections, noteQuery.isLoading]);

  if (draftStorageId && hydratedDraftStorageIdRef.current !== draftStorageId) {
    const storedDraft = safelyGetDraft(draftStorageId);
    if (storedDraft) {
      const nextDraft = draftFromSections(storedDraft);
      if (!draftsMatch(draftRef.current, nextDraft)) {
        setDraft(nextDraft);
      }
      hydratedDraftStorageIdRef.current = draftStorageId;
    } else if (noteQuery.data) {
      const nextDraft = draftFromSections(noteQuery.data.sections);
      if (!draftsMatch(draftRef.current, nextDraft)) {
        setDraft(nextDraft);
      }
      hydratedDraftStorageIdRef.current = draftStorageId;
    } else if (!initialTemplateKey || noteSessionId || draftHasContent) {
      // No hydration source is ready yet for this draft key.
    } else {
      const template = templateListQuery.data?.templates.find(
        (item) => item.key === initialTemplateKey,
      );
      if (template) {
        const nextDraft = draftFromSections(template.sections);
        if (!draftsMatch(draftRef.current, nextDraft)) {
          setDraft(nextDraft);
        }
        if (noteMeta.selectedTemplateKey !== template.key) {
          setNoteMeta((current) => ({
            ...current,
            selectedTemplateKey: template.key,
          }));
        }
        hydratedDraftStorageIdRef.current = draftStorageId;
      }
    }
  }

  // Debounced draft persistence (2s)
  useEffect(() => {
    if (!draftStorageId || noteStatus === "finalized") {
      return;
    }
    draftTimerRef.current = setTimeout(() => {
      safelySaveDraft(draftStorageId, sectionsFromDraft(draftRef.current));
    }, 2000);
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [draft, draftStorageId, noteStatus]);

  // Save draft on unmount or session change
  useEffect(() => {
    return () => {
      const currentDraftStorageId = latestDraftStorageIdRef.current;
      if (
        currentDraftStorageId &&
        latestNoteStatusRef.current !== "finalized" &&
        !skipDraftSaveIdsRef.current?.has(currentDraftStorageId)
      ) {
        safelySaveDraft(currentDraftStorageId, sectionsFromDraft(draftRef.current));
      }
      skipDraftSaveIdsRef.current?.delete(currentDraftStorageId);
    };
  }, []);

  const selectedPatient = useMemo(
    () =>
      selectedPatientProfileQuery.data ??
      patientListQuery.data?.items.find((item) => item.id === selectedPatientId),
    [patientListQuery.data?.items, selectedPatientId, selectedPatientProfileQuery.data],
  );

  const selectedTemplate = useMemo(
    () =>
      templateListQuery.data?.templates.find(
        (template) => template.key === selectedTemplateKey,
      ) ?? null,
    [selectedTemplateKey, templateListQuery.data?.templates],
  );
  const showPatientSetup = !initialPatientId.trim();

  const canEdit = Boolean(selectedPatientId) && noteStatus !== "finalized";
  const canFinalize =
    Boolean(selectedPatientId) &&
    Boolean(noteSessionId) &&
    noteStatus !== "finalized";
  const canReopen =
    Boolean(selectedPatientId) &&
    Boolean(noteSessionId) &&
    noteStatus === "finalized";
  const isBusy =
    createManualNote.isPending ||
    saveManualNote.isPending ||
    finalizeManualNote.isPending ||
    reopenManualNote.isPending ||
    generateSoapDraft.isPending ||
    regenerateSoapSection.isPending ||
    generatePatientSummary.isPending ||
    savePatientSummary.isPending;
  const missingGenerateRequirements = [
    !selectedPatientId ? "select a patient" : null,
    !transcriptText.trim() ? "add transcript text" : null,
  ].filter((requirement): requirement is string => Boolean(requirement));
  const generateSoapGuidance = generateSoapDraft.isPending
    ? null
    : noteStatus === "finalized"
      ? "Reopen the finalized note to generate a SOAP draft."
      : missingGenerateRequirements.length > 0
        ? `${missingGenerateRequirements.join(" and ").replace(/^./, (character) => character.toUpperCase())} to generate a SOAP draft.`
        : null;

  const selectedTemplateProvenanceLabel = formatTemplateProvenanceLabel(
    selectedTemplate,
    selectedTemplateKey,
    noteQuery.data?.templateProvenance,
  );

  function handleSelectPatient(patientId: string): void {
    setSelectedPatientId(patientId);
    setNoteSessionId("");
    setLocalDraftId(getLocalDraftIdForPatient(patientId));
    setDraft(EMPTY_DRAFT);
    setNoteMeta({ noteStatus: "draft", selectedTemplateKey: null });
    setTranscriptText("");
    setRegenerationHint("");
    setPatientSummary("");
    setSavedPatientSummary("");
    setIsPatientSummaryDirty(false);
    setIsSummaryDiscardVisible(false);
    setIsSummaryReplacementVisible(false);
    hydratedPatientSummarySessionIdRef.current = "";
    setSelectedSource("ai");
    setHasStartedNote(false);
    setPendingDraftReplacement(false);
    setPendingAction(null);
    setFeedbackMessage("");
    setComposerStage("capture");
    setActiveSection(null);
  }

  function handleChangeSection(
    section: keyof SoapDraft,
    value: string,
  ): void {
    setDraft((current) => ({ ...current, [section]: value }));
  }

  function handlePatientSummaryChange(value: string): void {
    const isDirty = value !== savedPatientSummary;
    setPatientSummary(value);
    setIsPatientSummaryDirty(isDirty);
    if (isDirty && feedbackTone === "success") {
      setFeedbackMessage("");
    }
  }

  async function handleSaveDraft(): Promise<DraftSaveOutcome> {
    if (!selectedPatientId || isBusy || noteStatus === "finalized") {
      setFeedbackTone("error");
      setFeedbackMessage("Select a valid patient before saving.");
      return "failed";
    }

    const input = {
      sections: sectionsFromDraft(draft),
      templateKey: selectedTemplateKey,
      templateApplyMode: selectedTemplateKey ? selectedTemplateMode : null,
    };

    setFeedbackTone("success");
    setFeedbackMessage(noteSessionId ? "Saving draft..." : "Creating draft...");

    try {
      if (!noteSessionId) {
        const createInput = {
          startedAt: new Date().toISOString(),
          visitType: DEFAULT_VISIT_TYPE,
          ...input,
        };

        safelySaveDraft(draftStorageId, input.sections);

        try {
          const created = await createManualNote.createManualNote({
            patientId: selectedPatientId,
            input: createInput,
          });

          skipDraftSaveIds.add(draftStorageId);
          safelyClearDraft(draftStorageId);
          setNoteSessionId(created.sessionId);
          setNoteMeta({
            noteStatus: created.noteStatus,
            selectedTemplateKey: created.templateKey,
          });
          const createdSummary = created.patientSummary ?? "";
          setPatientSummary(createdSummary);
          setSavedPatientSummary(createdSummary);
          setIsPatientSummaryDirty(false);
          setDraft(draftFromSections(created.sections));
          safelyClearDraft(created.sessionId);
          setFeedbackTone("success");
          setFeedbackMessage("Draft created.");
          return "saved";
        } catch (error) {
          if (!isOfflineLikeError(error)) {
            throw error;
          }
          saveQueuedChange({
            id: `manual-note-create:${localDraftId}`,
            type: "noteCreate",
            draftId: draftStorageId,
            patientId: selectedPatientId,
            input: createInput,
            timestamp: Date.now(),
          });
          setFeedbackTone("success");
          setFeedbackMessage("Saved offline. Will sync when online.");
          return "queued";
        }
      }

      if (await isOnlineForSave()) {
        try {
          const saved = await saveManualNote.saveManualNote({
            patientId: selectedPatientId,
            sessionId: noteSessionId,
            input,
          });

          removeQueuedNoteEditsForSession(noteSessionId);
          safelyClearDraft(noteSessionId);
          setNoteMeta({
            noteStatus: saved.noteStatus,
            selectedTemplateKey: saved.templateKey,
          });
          setDraft(draftFromSections(saved.sections));
          setFeedbackTone("success");
          setFeedbackMessage("Draft saved.");
          return "saved";
        } catch (error) {
          if (!isOfflineLikeError(error)) {
            throw error;
          }
        }
      }

      safelySaveDraft(noteSessionId, input.sections);
      saveQueuedChange({
        id: createQueueChangeId(),
        type: "noteEdit",
        sessionId: noteSessionId,
        patientId: selectedPatientId,
        sections: input.sections,
        timestamp: Date.now(),
      });
      setFeedbackTone("success");
      setFeedbackMessage("Saved offline. Will sync when online.");
      return "queued";
    } catch (error) {
      setFeedbackTone("error");
      setFeedbackMessage(getUserSafeErrorMessage(error));
      return "failed";
    }
  }

  async function handleConfirmAction(): Promise<void> {
    if (!selectedPatientId || !noteSessionId || !pendingAction) {
      return;
    }

    try {
      if (pendingAction === "finalize") {
        const updated = await finalizeManualNote.finalizeManualNote({
          patientId: selectedPatientId,
          sessionId: noteSessionId,
        });
        pendingServerNoteStatusRef.current = updated.noteStatus;
        setNoteMeta((current) => ({
          ...current,
          noteStatus: updated.noteStatus,
        }));
        setPendingAction(null);
        setComposerStage("finish");
        setFeedbackTone("success");
        setFeedbackMessage("Note finalized.");
        return;
      }

      const updated = await reopenManualNote.reopenManualNote({
        patientId: selectedPatientId,
        sessionId: noteSessionId,
      });
      pendingServerNoteStatusRef.current = updated.noteStatus;
      setNoteMeta((current) => ({
        ...current,
        noteStatus: updated.noteStatus,
      }));
      setPendingAction(null);
      setComposerStage("review");
      setFeedbackTone("success");
      setFeedbackMessage("Note reopened.");
    } catch {
      setFeedbackTone("error");
      setFeedbackMessage("Could not update note lifecycle. Try again.");
    }
  }

  async function ensureSessionExists(): Promise<string | null> {
    if (noteSessionId) return noteSessionId;
    if (!selectedPatientId) return null;

    setFeedbackTone("success");
    setFeedbackMessage("Creating session...");

    try {
      const created = await createManualNote.createManualNote({
        patientId: selectedPatientId,
        input: {
          startedAt: new Date().toISOString(),
          visitType: DEFAULT_VISIT_TYPE,
          sections: sectionsFromDraft(draft),
          templateKey: selectedTemplateKey,
          templateApplyMode: selectedTemplateKey ? selectedTemplateMode : null,
        },
      });

      if (draftStorageId) {
        skipDraftSaveIds.add(draftStorageId);
        safelyClearDraft(draftStorageId);
      }
      setNoteSessionId(created.sessionId);
      setNoteMeta({
        noteStatus: created.noteStatus,
        selectedTemplateKey: created.templateKey,
      });
      setDraft(draftFromSections(created.sections));
      safelyClearDraft(created.sessionId);
      return created.sessionId;
    } catch (error) {
      if (isOfflineLikeError(error)) {
        const input = {
          startedAt: new Date().toISOString(),
          visitType: DEFAULT_VISIT_TYPE,
          sections: sectionsFromDraft(draft),
          templateKey: selectedTemplateKey,
          templateApplyMode: selectedTemplateKey ? selectedTemplateMode : null,
        };
        safelySaveDraft(draftStorageId, input.sections);
        saveQueuedChange({
          id: `manual-note-create:${localDraftId}`,
          type: "noteCreate",
          draftId: draftStorageId,
          patientId: selectedPatientId,
          input,
          timestamp: Date.now(),
        });
        setFeedbackTone("success");
        setFeedbackMessage("Saved offline. Will sync when online.");
        return null;
      }
      setFeedbackTone("error");
      setFeedbackMessage("Could not create session. Try saving a draft first.");
      return null;
    }
  }

  function handleGenerateSoapDraft(): void {
    if (draftHasContent) {
      setPendingDraftReplacement(true);
      return;
    }

    void generateSoapDraftFromRecap();
  }

  async function generateSoapDraftFromRecap(transcriptOverride?: string): Promise<void> {
    const recap = transcriptOverride ?? transcriptText;
    if (!selectedPatientId || !recap.trim() || isBusy) {
      setFeedbackTone("error");
      setFeedbackMessage("Select a patient and provide transcript text before generating.");
      return;
    }

    const sessionId = await ensureSessionExists();
    if (!sessionId) return;

    setFeedbackTone("success");
    setFeedbackMessage("Generating SOAP draft...");
    try {
      const generated = await generateSoapDraft.generateSoapDraft({
        patientId: selectedPatientId,
        sessionId,
        transcriptText: recap.trim(),
      });
      setDraft(draftFromGeneratedSections(generated.sections));
      setHasStartedNote(true);
      setComposerStage("review");
      setActiveSection(null);
      setFeedbackTone("success");
      setFeedbackMessage("SOAP draft generated.");
    } catch {
      setFeedbackTone("error");
      setFeedbackMessage("Could not generate SOAP draft. Try again.");
    }
  }

  useEffect(() => {
    if (!soapGenerationRequest || handledSoapGenerationRequestIdsRef.current.has(soapGenerationRequest.id)) {
      return;
    }

    handledSoapGenerationRequestIdsRef.current.add(soapGenerationRequest.id);
    setTranscriptText(soapGenerationRequest.transcriptText);
    onSoapGenerationRequestHandled?.(soapGenerationRequest.id);
    void generateSoapDraftFromRecap(soapGenerationRequest.transcriptText);
  }, [soapGenerationRequest, onSoapGenerationRequestHandled]);

  async function handleRegenerateSection(section: keyof SoapDraft): Promise<void> {
    if (!selectedPatientId || !transcriptText.trim() || isBusy) {
      setFeedbackTone("error");
      setFeedbackMessage("Select a patient and provide transcript text before regenerating.");
      return;
    }

    const sessionId = noteSessionId || await ensureSessionExists();
    if (!sessionId) return;

    if (noteSessionId && await handleSaveDraft() !== "saved") {
      return;
    }

    setFeedbackTone("success");
    setFeedbackMessage(`Regenerating ${section}...`);
    try {
      const regenerated = await regenerateSoapSection.regenerateSoapSection({
        patientId: selectedPatientId,
        sessionId,
        transcriptText: transcriptText.trim(),
        section,
        ...(regenerationHint.trim() ? { hint: regenerationHint.trim() } : {}),
      });
      setDraft(draftFromGeneratedSections(regenerated.sections));
      setFeedbackTone("success");
      setFeedbackMessage(`${section} regenerated.`);
    } catch {
      setFeedbackTone("error");
      setFeedbackMessage(`Could not regenerate ${section}. Try again.`);
    }
  }

  async function handleGeneratePatientSummary(sessionIdOverride?: string): Promise<void> {
    if (!selectedPatientId || noteStatus === "finalized" || isBusy) {
      setFeedbackTone("error");
      setFeedbackMessage("Select a patient and ensure the note is not finalized.");
      return;
    }

    const sessionId = sessionIdOverride ?? await ensureSessionExists();
    if (!sessionId) return;

    setFeedbackTone("success");
    setFeedbackMessage("Generating summary...");
    try {
      const generated = await generatePatientSummary.generatePatientSummary({
        patientId: selectedPatientId,
        sessionId,
      });
      setPatientSummary(generated.patientSummary);
      setSavedPatientSummary(generated.patientSummary);
      setIsPatientSummaryDirty(false);
      setFeedbackTone("success");
      setFeedbackMessage("Summary generated.");
    } catch {
      setFeedbackTone("error");
      setFeedbackMessage("Could not generate summary. Try again.");
    }
  }

  async function handleSavePatientSummary(): Promise<boolean> {
    if (
      !selectedPatientId ||
      !noteSessionId ||
      noteStatus === "finalized" ||
      !patientSummary.trim() ||
      isBusy
    ) {
      return false;
    }

    Keyboard.dismiss();
    setFeedbackTone("success");
    setFeedbackMessage("Saving summary...");
    try {
      const saved = await savePatientSummary.savePatientSummary({
        patientId: selectedPatientId,
        sessionId: noteSessionId,
        patientSummary: patientSummary.trim(),
      });
      setPatientSummary(saved.patientSummary);
      setSavedPatientSummary(saved.patientSummary);
      setIsPatientSummaryDirty(false);
      setFeedbackTone("success");
      setFeedbackMessage("");
      return true;
    } catch {
      setFeedbackTone("error");
      setFeedbackMessage("Could not save summary. Try again.");
      return false;
    }
  }

  function handleStartManually(): void {
    setHasStartedNote(true);
    setComposerStage("review");
    setActiveSection(null);
    setFeedbackTone("success");
    setFeedbackMessage("Add the clinical details you want to keep in the note.");
  }

  function handleChooseSource(source: DocumentationSource): void {
    setSelectedSource(source);
  }

  function handleStartVoiceCapture(): void {
    if (onStartVoiceCapture) {
      onStartVoiceCapture();
      return;
    }

    setFeedbackTone("error");
    setFeedbackMessage("Voice capture is unavailable. Use a short recap or write manually.");
  }

  function handleUseCaptureTemplate(template: ConditionTemplate): void {
    const templateDraft = draftFromSections(template.sections);
    const nextDraft = selectedTemplateMode === "replaceAll"
      ? templateDraft
      : {
          subjective: draft.subjective || templateDraft.subjective,
          objective: draft.objective || templateDraft.objective,
          assessment: draft.assessment || templateDraft.assessment,
          plan: draft.plan || templateDraft.plan,
        };

    setDraft(nextDraft);
    setHasStartedNote(true);
    setNoteMeta((current) => ({ ...current, selectedTemplateKey: template.key }));
    setComposerStage("review");
    setActiveSection(null);
    setFeedbackTone("success");
    setFeedbackMessage(`${template.label} template applied.`);
  }

  function handleStageChange(stage: ComposerStage): void {
    if (stage === "capture") {
      setActiveSection(null);
      setComposerStage("capture");
      return;
    }

    if (stage === "review" && hasStartedNote) {
      setActiveSection(null);
      setComposerStage("review");
      return;
    }

    if (stage === "finish" && noteStatus === "finalized") {
      setActiveSection(null);
      setComposerStage("finish");
      return;
    }

    if (stage === "finish" && draftHasContent) {
      void handleContinueToFinalReview();
    }
  }

  function handleLocalBack(): void {
    if (activeSection) {
      setActiveSection(null);
      return;
    }

    if (composerStage === "finish") {
      setComposerStage("review");
      return;
    }

    if (composerStage === "review") {
      if (!returnsToProfileOnReviewBack) {
        setComposerStage("capture");
        return;
      }
    }

    if (savePatientSummary.isPending) {
      setFeedbackTone("success");
      setFeedbackMessage("Saving summary. Keep this screen open until it is saved.");
      return;
    }

    if (isPatientSummaryDirty) {
      setIsSummaryDiscardVisible(true);
      return;
    }

    onBack?.();
  }

  useEffect(() => {
    const subscription = BackHandler?.addEventListener?.("hardwareBackPress", () => {
      handleLocalBack();
      return true;
    });

    return () => subscription?.remove();
  }, [activeSection, composerStage, isPatientSummaryDirty, onBack, savePatientSummary.isPending]);

  async function handleContinueToFinalReview(): Promise<void> {
    if (!selectedPatientId || isBusy) {
      return;
    }

    if (!draftHasContent) {
      setFeedbackTone("error");
      setFeedbackMessage("Add clinical note details before continuing.");
      return;
    }

    if (noteSessionId) {
      if (await handleSaveDraft() !== "saved") {
        return;
      }
      setComposerStage("finish");
      const existingSummary = patientSummary.trim() || noteQuery.data?.patientSummary?.trim();
      if (existingSummary) {
        if (!isPatientSummaryDirty) {
          setPatientSummary(existingSummary);
          setSavedPatientSummary(existingSummary);
        }
        setFeedbackTone("success");
        setFeedbackMessage("");
        return;
      }
      await handleGeneratePatientSummary(noteSessionId);
      return;
    }

    const createdSessionId = await ensureSessionExists();
    if (!createdSessionId) {
      return;
    }
    setComposerStage("finish");
    await handleGeneratePatientSummary(createdSessionId);
  }

  const activeSectionMeta = activeSection ? SOAP_SECTION_META[activeSection] : null;
  const noteStatusLabel =
    noteStatus === "finalized" || noteStatus === "reopened" || hasStartedNote
      ? statusLabel(noteStatus)
      : "Not started";
  const screenTitle = composerStage === "capture"
    ? "New SOAP note"
    : composerStage === "review"
      ? "Review SOAP note"
      : "Final review";
  const canNavigateBack = Boolean(onBack) || Boolean(activeSection) || composerStage !== "capture";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.screenRoot}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.headerRow}>
        <MeridianScreenHeader
          title={screenTitle}
          {...(canNavigateBack ? { onBack: handleLocalBack, backTestID: "note-back-button" } : {})}
          action={composerStage === "finish" && noteSessionId && onViewHistory ? (
            <MeridianButton
              label="History"
              variant="ghost"
              onPress={() => onViewHistory(noteSessionId)}
              testID="note-view-history-button"
            />
          ) : undefined}
          variant="task"
        />
      </View>

      {selectedPatient ? (
        <View style={styles.contextCard} testID="note-patient-context">
          <View style={styles.contextIdentity}>
            <Text style={styles.contextLabel}>Patient</Text>
            <Text style={styles.contextValue}>{selectedPatient.fullName}</Text>
          </View>
          <Text style={styles.contextMeta}>{noteProgressLabel(noteStatus, hasStartedNote)}</Text>
        </View>
      ) : null}

      {showPatientSetup ? (
      <View style={styles.surfaceSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Patient</Text>
          <Text style={styles.countText}>{patientListQuery.data?.items.length ?? 0}</Text>
        </View>
        <MeridianInput
          placeholder="Search patient"
          value={patientSearch}
          onChangeText={setPatientSearch}
          testID="note-patient-search-input"
        />
        {selectedPatient ? (
          <View style={styles.selectedBanner}>
            <Text style={styles.selectedBannerLabel}>Selected patient</Text>
            <Text style={styles.selectedBannerValue}>{selectedPatient.fullName}</Text>
          </View>
        ) : null}
        {patientListQuery.isLoading ? (
          <Text style={styles.emptyText}>Loading patients...</Text>
        ) : patientListQuery.data?.items.length ? (
          <View style={styles.patientList}>
            {patientListQuery.data.items.map((patient, index) => (
              <PatientPill
                key={patient.id}
                label={patient.fullName}
                active={patient.id === selectedPatientId}
                onPress={() => handleSelectPatient(patient.id)}
                testID={`note-patient-${index}-pill`}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No patients match this filter.</Text>
        )}
      </View>
      ) : null}

      <View style={styles.composerSurface}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.stageLabel}>
            {composerStage === "capture" ? "Step 1 of 3" : composerStage === "review" ? "Step 2 of 3" : "Step 3 of 3"}
          </Text>
          <MeridianStatusPill
            status={noteStatus as StatusPillType}
            label={noteStatusLabel}
            testID="note-status-pill"
          />
        </View>
        <View style={styles.stageTrack} accessibilityLabel={`Step ${composerStage === "capture" ? "1" : composerStage === "review" ? "2" : "3"} of 3`}>
          {([
            ["capture", "1", "Draft", false],
            ["review", "2", "Review", !hasStartedNote],
            ["finish", "3", "Finish", !draftHasContent && noteStatus !== "finalized"],
          ] as const).map(([stage, number, label, disabled]) => {
            const selected = composerStage === stage;
            return (
              <Pressable
                key={stage}
                accessibilityRole="button"
                accessibilityLabel={`${label}, step ${number} of 3`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                focusable={!disabled}
                testID={`note-stage-${stage}-button`}
                onPress={() => handleStageChange(stage)}
                style={({ pressed }) => [
                  styles.stageButton,
                  selected ? styles.stageButtonSelected : null,
                  disabled ? styles.stageButtonDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={selected ? styles.stageNumberSelected : styles.stageNumber}>
                  <Text style={selected ? styles.stageButtonNumberSelected : styles.stageButtonNumber}>{number}</Text>
                </View>
                <Text style={selected ? styles.stageButtonTextSelected : styles.stageButtonText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {composerStage === "capture" ? (
          <View testID="note-capture-stage" style={styles.stageBody}>
            <Text style={styles.stageHeading}>Create this note</Text>
            <Text style={styles.helperText}>Choose a source. Nothing is created until you continue.</Text>
            <View style={styles.sourceSelector}>
              {([
                ["ai", "AI recap"],
                ["voice", "Voice"],
                ["manual", "Manual"],
                ["template", "Template"],
              ] as const).map(([source, label]) => (
                <Pressable
                  key={source}
                  accessibilityRole="button"
                  accessibilityLabel={`Start with ${label}`}
                  accessibilityState={{ selected: selectedSource === source }}
                  focusable
                  testID={`note-source-${source}-button`}
                  onPress={() => handleChooseSource(source)}
                  style={({ pressed }) => [
                    styles.sourceButton,
                    selectedSource === source ? styles.sourceButtonSelected : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={selectedSource === source ? styles.sourceButtonTextSelected : styles.sourceButtonText}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedSource === "ai" ? (
              <>
                <Text style={styles.stageHeading}>What happened in this visit?</Text>
                <Text style={styles.helperText}>Type or paste a short recap. AI will organize it into an editable SOAP note.</Text>
                <MeridianInput
                  style={styles.transcriptInput}
                  placeholder="Brief visit recap"
                  value={transcriptText}
                  onChangeText={setTranscriptText}
                  editable={Boolean(selectedPatientId) && noteStatus !== "finalized"}
                  multiline
                  testID="note-visit-recap-input"
                />
                <MeridianButton
                  label={generateSoapDraft.isPending ? "Creating draft..." : "Create SOAP draft"}
                  variant="primary"
                  disabled={!selectedPatientId || !transcriptText.trim() || noteStatus === "finalized" || generateSoapDraft.isPending}
                  onPress={handleGenerateSoapDraft}
                  testID="note-create-soap-draft-button"
                />
                {generateSoapGuidance ? <Text testID="note-generate-soap-guidance" style={styles.helperText}>{generateSoapGuidance.replace("transcript text", "a visit recap")}</Text> : null}
              </>
            ) : null}

            {selectedSource === "voice" ? (
              <>
                <Text style={styles.stageHeading}>Record a voice recap</Text>
                <Text style={styles.helperText}>Record the visit, check the transcript, then create the SOAP draft from it.</Text>
                <MeridianButton
                  label="Record voice recap"
                  variant="primary"
                  disabled={!selectedPatientId || noteStatus === "finalized"}
                  onPress={handleStartVoiceCapture}
                  testID="note-start-voice-button"
                />
              </>
            ) : null}

            {selectedSource === "manual" ? (
              <View style={styles.sourceDetail}>
                <Text style={styles.stageHeading}>Write it yourself</Text>
                <Text style={styles.helperText}>Start with four empty SOAP sections and add only the findings you want in the record.</Text>
                <MeridianButton
                  label="Start blank note"
                  variant="primary"
                  disabled={!selectedPatientId || noteStatus === "finalized"}
                  onPress={handleStartManually}
                  testID="note-start-manual-button"
                />
              </View>
            ) : null}

            {selectedSource === "template" ? (
              <>
                <Text style={styles.stageHeading}>Start from a template</Text>
                <Text style={styles.helperText}>Choose whether the template fills blanks or replaces the current SOAP sections.</Text>
                <View style={styles.modeRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedTemplateMode === "fillBlank" }}
                    focusable
                    testID="note-template-fill-blanks-button"
                    onPress={() => setSelectedTemplateMode("fillBlank")}
                    style={({ pressed }) => [styles.modePill, selectedTemplateMode === "fillBlank" ? styles.modePillActive : null, pressed ? styles.modePillPressed : null]}
                  >
                    <Text style={selectedTemplateMode === "fillBlank" ? styles.modePillTextActive : styles.modePillText}>Fill blanks</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedTemplateMode === "replaceAll" }}
                    focusable
                    testID="note-template-replace-all-button"
                    onPress={() => setSelectedTemplateMode("replaceAll")}
                    style={({ pressed }) => [styles.modePill, selectedTemplateMode === "replaceAll" ? styles.modePillActive : null, pressed ? styles.modePillPressed : null]}
                  >
                    <Text style={selectedTemplateMode === "replaceAll" ? styles.modePillTextActive : styles.modePillText}>Replace all</Text>
                  </Pressable>
                </View>
                <View style={styles.templateList}>
                  {(templateListQuery.data?.templates ?? []).map((template, index) => (
                    <Pressable
                      key={template.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${template.label} template`}
                      focusable
                      testID={`note-capture-template-${index}-card`}
                      onPress={() => handleUseCaptureTemplate(template)}
                      style={({ pressed }) => [styles.templateCard, pressed ? styles.templateCardPressed : null]}
                    >
                      <Text style={styles.templateLabel}>{template.label}</Text>
                      <Text style={styles.templateMeta}>{template.description}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {composerStage === "review" && !activeSection ? (
          <View testID="note-review-stage" style={styles.stageBody}>
            <Text style={styles.helperText}>Review each section before final review. Changes save automatically on this device.</Text>
            {selectedTemplateKey ? <Text testID="note-template-provenance-label" style={styles.helperText}>{selectedTemplateProvenanceLabel}</Text> : null}
            {noteStatus === "finalized" ? (
              <View style={styles.lockBanner}>
                <Text style={styles.lockBannerLabel}>Finalized note</Text>
                <Text style={styles.lockBannerValue}>Reopen the note before editing its sections.</Text>
              </View>
            ) : null}
            {(Object.keys(SOAP_SECTION_META) as SoapSectionKey[]).map((section) => (
              <SoapSectionRow
                key={section}
                section={section}
                value={draft[section]}
                disabled={!canEdit}
                onPress={() => setActiveSection(section)}
              />
            ))}
            <MeridianButton
              label="Continue to final review"
              variant="primary"
              disabled={!draftHasContent || noteStatus === "finalized" || isBusy}
              onPress={() => void handleContinueToFinalReview()}
              testID="note-continue-final-review-button"
            />
          </View>
        ) : null}

        {composerStage === "review" && activeSection && activeSectionMeta ? (
          <View testID={`note-${activeSection}-editor`} style={[styles.stageBody, styles.sectionEditor]}>
            <View style={styles.sectionEditorHeader}>
              <Text style={styles.stageHeading}>{activeSectionMeta.title}</Text>
              <Text style={styles.sectionScopeLabel}>Updates this section only</Text>
            </View>
            <MeridianInput
              style={styles.sectionEditorInput}
              placeholder={activeSectionMeta.placeholder}
              value={draft[activeSection]}
              onChangeText={(value) => handleChangeSection(activeSection, value)}
              editable={canEdit}
              multiline
              testID={`note-${activeSection}-input`}
            />
            <View style={styles.regenerationPanel}>
              <Text style={styles.regenerationPanelTitle}>Refine with AI</Text>
              <Text style={styles.regenerationCopy}>Use a visit recap to replace {activeSectionMeta.title} only.</Text>
              <MeridianInput
                style={styles.regenerationRecapInput}
                placeholder="Visit recap for AI"
                value={transcriptText}
                onChangeText={setTranscriptText}
                editable={canEdit}
                multiline
                testID="note-section-recap-input"
              />
              <MeridianInput
                placeholder="Optional instruction"
                value={regenerationHint}
                onChangeText={setRegenerationHint}
                editable={canEdit}
                testID="note-hint-input"
              />
              <MeridianButton
                label="Regenerate with AI"
                variant="primary"
                disabled={!canEdit || !transcriptText.trim() || isBusy}
                onPress={() => void handleRegenerateSection(activeSection)}
                testID={`note-regenerate-${activeSection}-button`}
              />
              {!transcriptText.trim() ? <Text style={styles.regenerationGuidance}>Add a visit recap to enable regeneration.</Text> : null}
            </View>
          </View>
        ) : null}

        {composerStage === "finish" ? (
          <View testID="note-final-review-stage" style={styles.stageBody}>
            <Text style={styles.stageHeading}>{noteStatus === "finalized" ? "Note finalized" : "Patient next steps"}</Text>
            <Text style={styles.helperText}>{noteStatus === "finalized" ? "This note is locked. Export or reopen it when needed." : "Check the patient-facing summary before finalizing the note."}</Text>
            <MeridianInput
              placeholder="Patient-friendly summary"
              value={patientSummary}
              onChangeText={handlePatientSummaryChange}
              editable={Boolean(selectedPatientId) && Boolean(noteSessionId) && noteStatus !== "finalized"}
              multiline
              testID="note-patient-summary-input"
              style={styles.summaryInput}
            />
            <Text style={styles.summaryStatus} accessibilityLiveRegion="polite">
              {isPatientSummaryDirty
                ? "Changes need to be saved."
                : patientSummary.trim()
                  ? "Summary saved for this session."
                  : "Add patient next steps or generate a summary."}
            </Text>
            {generatePatientSummary.isPending ? <Text style={styles.helperText}>Creating patient summary...</Text> : null}
            {noteStatus !== "finalized" ? (
              <View style={styles.secondaryActionStack}>
                <MeridianButton
                  label={patientSummary.trim() ? "Generate a new summary" : "Try generating again"}
                  variant="ghost"
                  disabled={!selectedPatientId || !noteSessionId || generatePatientSummary.isPending}
                  onPress={() => setIsSummaryReplacementVisible(true)}
                  testID="note-generate-summary-button"
                />
                {isSummaryReplacementVisible ? (
                  <View style={styles.summaryReplacementPanel}>
                    <Text style={styles.summaryReplacementTitle}>Replace this saved summary?</Text>
                    <Text style={styles.summaryReplacementCopy}>Generating a new summary replaces the current patient-facing wording.</Text>
                    <View style={styles.actionRow}>
                      <MeridianButton
                        label="Keep current summary"
                        variant="ghost"
                        onPress={() => setIsSummaryReplacementVisible(false)}
                        testID="note-cancel-replace-summary-button"
                      />
                      <MeridianButton
                        label="Generate new summary"
                        variant="secondary"
                        onPress={() => {
                          setIsSummaryReplacementVisible(false);
                          void handleGeneratePatientSummary();
                        }}
                        testID="note-confirm-replace-summary-button"
                      />
                    </View>
                  </View>
                ) : null}
                {isPatientSummaryDirty ? (
                  <MeridianButton
                    label={savePatientSummary.isPending ? "Saving changes..." : "Save changes"}
                    variant="primary"
                    disabled={!selectedPatientId || !noteSessionId || !patientSummary.trim() || savePatientSummary.isPending}
                    onPress={() => void handleSavePatientSummary()}
                    testID="note-save-summary-button"
                  />
                ) : (
                  <MeridianButton
                    label="Finalize note"
                    variant="primary"
                    disabled={!canFinalize || isBusy}
                    onPress={() => {
                      Keyboard.dismiss();
                      setPendingAction("finalize");
                    }}
                    testID="note-finalize-action-button"
                  />
                )}
                <MeridianButton label="Edit SOAP note" variant="ghost" onPress={() => setComposerStage("review")} testID="note-final-review-back-button" />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {!activeSection ? (
        <View style={styles.feedbackBar}>
          <Text
            style={[
              styles.feedbackSlot,
              feedbackTone === "success" ? styles.feedbackSuccess : styles.feedbackError,
            ]}
            accessibilityLiveRegion="polite"
          >
            {feedbackMessage || (noteSessionId ? "Changes save automatically on this device." : "Draft saves automatically on this device.")}
          </Text>
          {canReopen ? (
            <MeridianButton
              label="Reopen note"
              variant="secondary"
              onPress={() => {
                Keyboard.dismiss();
                setPendingAction("reopen");
              }}
              testID="note-reopen-button"
            />
          ) : null}
          {noteStatus === "finalized" && onOpenExportShare && selectedPatientId && noteSessionId ? (
            <MeridianButton
              label="Export & Share"
              variant="secondary"
              onPress={() => {
                Keyboard.dismiss();
                onOpenExportShare({
                  patientId: selectedPatientId,
                  sessionId: noteSessionId,
                  noteStatus,
                  patientSummary,
                  sections: {
                    subjective: draft.subjective,
                    objective: draft.objective,
                    assessment: draft.assessment,
                    plan: draft.plan,
                  },
                });
              }}
              testID="note-export-share-button"
            />
          ) : null}
        </View>
      ) : null}
      </ScrollView>
    {pendingDraftReplacement ? (
      <Modal transparent animationType="fade" visible onRequestClose={() => setPendingDraftReplacement(false)}>
        <View style={styles.confirmationOverlay}>
          <View style={styles.confirmationBox}>
            <Text style={styles.confirmationTitle}>Replace current SOAP draft?</Text>
            <Text style={styles.confirmationCopy}>
              Creating a new AI draft replaces the current SOAP sections. Your existing note stays unchanged until you confirm.
            </Text>
            <View style={styles.actionRow}>
              <MeridianButton
                label="Keep current draft"
                variant="ghost"
                onPress={() => setPendingDraftReplacement(false)}
                testID="note-cancel-replace-draft-button"
              />
              <MeridianButton
                label="Replace SOAP draft"
                variant="primary"
                onPress={() => {
                  setPendingDraftReplacement(false);
                  void generateSoapDraftFromRecap();
                }}
                testID="note-confirm-replace-draft-button"
              />
            </View>
          </View>
        </View>
      </Modal>
    ) : null}
    {pendingAction ? (
      <Modal transparent animationType="fade" visible onRequestClose={() => setPendingAction(null)}>
      <View style={styles.confirmationOverlay}>
        <View style={styles.confirmationBox}>
          <Text style={styles.confirmationTitle}>
            {pendingAction === "finalize" ? "Finalize this note?" : "Reopen this note?"}
          </Text>
          <Text style={styles.confirmationCopy}>
            {pendingAction === "finalize"
              ? "Finalizing locks the editors until the note is reopened."
              : "Reopening makes the SOAP sections editable again."}
          </Text>
          <View style={styles.actionRow}>
            <MeridianButton label="Cancel" variant="ghost" onPress={() => setPendingAction(null)} testID="note-cancel-confirm-button" />
            <MeridianButton
              label="Confirm"
              variant={pendingAction === "finalize" ? "primary" : "destructive"}
              onPress={() => void handleConfirmAction()}
              testID="note-confirm-action-button"
            />
          </View>
        </View>
      </View>
      </Modal>
    ) : null}
    {isSummaryDiscardVisible ? (
      <Modal transparent animationType="fade" visible onRequestClose={() => setIsSummaryDiscardVisible(false)}>
        <View style={styles.confirmationOverlay}>
          <View style={styles.confirmationBox}>
            <Text style={styles.confirmationTitle}>Discard unsaved summary changes?</Text>
            <Text style={styles.confirmationCopy}>Your unsaved patient summary changes will be lost.</Text>
            <View style={styles.actionRow}>
              <MeridianButton
                label="Keep editing"
                variant="ghost"
                onPress={() => setIsSummaryDiscardVisible(false)}
                testID="note-cancel-discard-summary-button"
              />
              <MeridianButton
                label="Discard changes"
                variant="destructive"
                onPress={() => {
                  setPatientSummary(savedPatientSummary);
                  setIsPatientSummaryDirty(false);
                  setIsSummaryDiscardVisible(false);
                  onBack?.();
                }}
                testID="note-confirm-discard-summary-button"
              />
            </View>
          </View>
        </View>
      </Modal>
    ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  screen: {
    paddingHorizontal: meridian.spacing.lg,
    paddingTop: meridian.spacing.md,
    gap: meridian.spacing.lg,
    backgroundColor: meridian.color.background,
    paddingBottom: 96,
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
  contextCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
    paddingVertical: meridian.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: meridian.color.border,
  },
  contextIdentity: {
    flex: 1,
    gap: 2,
  },
  contextLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  contextValue: {
    ...typography.heading,
    color: meridian.color.text,
  },
  contextMeta: {
    ...typography.label,
    color: meridian.color.warning,
    backgroundColor: meridian.color.warningSoft,
    borderRadius: meridian.radius.chip,
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
  },
  surfaceSection: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    gap: meridian.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  countText: {
    color: meridian.color.primary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.control,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: meridian.color.text,
    fontSize: 16,
  },
  selectedBanner: {
    backgroundColor: meridian.color.primarySoft,
    borderRadius: meridian.radius.card,
    padding: 14,
    gap: 4,
  },
  selectedBannerLabel: {
    color: meridian.color.primary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  selectedBannerValue: {
    color: meridian.color.text,
    fontSize: 15,
    fontWeight: "600",
  },
  patientList: {
    gap: 10,
  },
  patientRow: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    borderWidth: 1,
    borderColor: meridian.color.border,
    padding: 14,
    gap: 4,
  },
  patientRowActive: {
    borderColor: meridian.color.primary,
    backgroundColor: meridian.color.primarySoft,
  },
  patientRowPressed: {
    opacity: 0.9,
  },
  patientName: {
    ...typography.body,
    fontWeight: "600",
    color: meridian.color.text,
  },
  patientMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  patientMetaActive: {
    ...typography.label,
    color: meridian.color.primary,
  },
  templateList: {
    gap: 10,
  },
  templateCard: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    borderWidth: 1,
    borderColor: meridian.color.border,
    padding: 14,
    gap: 4,
  },
  templateCardSelected: {
    borderColor: meridian.color.primary,
    backgroundColor: meridian.color.primarySoft,
  },
  templateCardPressed: {
    opacity: 0.9,
  },
  templateCardDisabled: {
    opacity: 0.5,
  },
  templateLabel: {
    ...typography.body,
    fontWeight: "600",
    color: meridian.color.text,
  },
  templateMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  modePill: {
    backgroundColor: meridian.color.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: meridian.color.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modePillActive: {
    backgroundColor: meridian.color.primary,
    borderColor: meridian.color.primary,
  },
  modePillPressed: {
    opacity: 0.92,
  },
  disabledPill: {
    opacity: 0.5,
  },
  modePillText: {
    color: meridian.color.text,
    fontSize: 13,
    fontWeight: "600",
  },
  modePillTextActive: {
    color: meridian.color.surface,
    fontSize: 13,
    fontWeight: "600",
  },
  helperText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  transcriptInput: {
    minHeight: 140,
    textAlignVertical: "top",
    paddingTop: 16,
    paddingBottom: 16,
  },
  hintInput: {
    minHeight: 64,
  },
  emptyText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  lockBanner: {
    backgroundColor: meridian.color.errorSurface,
    borderRadius: meridian.radius.card,
    padding: 14,
    gap: 4,
  },
  lockBannerLabel: {
    color: meridian.color.destructive,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  summaryBlock: {
    gap: meridian.spacing.sm,
  },
  summaryLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  lockBannerValue: {
    color: meridian.color.text,
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: meridian.spacing.sm,
  },
  secondaryActionStack: {
    gap: meridian.spacing.sm,
  },
  confirmationBox: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    borderWidth: 1,
    borderColor: meridian.color.border,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
  },
  confirmationOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    padding: meridian.spacing.md,
    zIndex: 10,
  },
  feedbackSuccess: {
    ...typography.body,
    color: meridian.color.primary,
  },
  feedbackError: {
    ...typography.body,
    color: meridian.color.destructive,
  },
  feedbackSlot: {
    minHeight: 22,
  },
  confirmationTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  confirmationCopy: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  sectionCard: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
    ...meridian.shadow.card,
  },
  sectionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.sm,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    ...typography.label,
    color: meridian.color.primary,
    fontSize: 12,
  },
  sectionCardTitle: {
    ...typography.label,
    color: meridian.color.text,
    flex: 1,
  },
  regenerateLink: {
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
    borderRadius: meridian.radius.chip,
    backgroundColor: meridian.color.primarySoft,
  },
  regenerateLinkText: {
    ...typography.label,
    color: meridian.color.primary,
    fontSize: 12,
  },
  sectionCardInput: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  sectionCardInputDisabled: {
    opacity: 0.65,
  },
  composerSurface: {
    gap: meridian.spacing.md,
  },
  stageLabel: {
    ...typography.label,
    color: meridian.color.primary,
  },
  stageTrack: {
    flexDirection: "row",
    gap: meridian.spacing.md,
  },
  stageButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "transparent",
  },
  stageButtonSelected: {
    backgroundColor: "transparent",
  },
  stageButtonDisabled: {
    opacity: 0.5,
  },
  stageButtonNumber: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  stageButtonNumberSelected: {
    ...typography.label,
    color: meridian.color.surface,
  },
  stageNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: meridian.color.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  stageNumberSelected: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: meridian.color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stageButtonText: {
    ...typography.label,
    color: meridian.color.text,
  },
  stageButtonTextSelected: {
    ...typography.label,
    color: meridian.color.primary,
  },
  sourceSelector: {
    flexDirection: "row",
    gap: 4,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: meridian.color.border,
  },
  sourceButton: {
    minHeight: 48,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderRadius: meridian.radius.control,
    backgroundColor: "transparent",
  },
  sourceButtonSelected: {
    backgroundColor: meridian.color.primarySoft,
  },
  sourceButtonText: {
    ...typography.label,
    color: meridian.color.text,
  },
  sourceButtonTextSelected: {
    ...typography.label,
    color: meridian.color.primary,
  },
  stageBody: {
    gap: meridian.spacing.md,
  },
  stageHeading: {
    ...typography.heading,
    color: meridian.color.text,
  },
  sourceDetail: {
    gap: meridian.spacing.md,
    paddingTop: meridian.spacing.xs,
  },
  textAction: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  textActionLabel: {
    ...typography.label,
    color: meridian.color.primary,
  },
  soapSectionRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: meridian.color.border,
    paddingVertical: meridian.spacing.sm,
  },
  soapSectionRowDisabled: {
    opacity: 0.6,
  },
  soapSectionRowCopy: {
    flex: 1,
    gap: 2,
  },
  soapSectionPreview: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontWeight: "400",
  },
  soapSectionChevron: {
    ...typography.heading,
    color: meridian.color.primary,
  },
  sectionEditorInput: {
    minHeight: 184,
    textAlignVertical: "top",
  },
  sectionEditor: {
    gap: meridian.spacing.lg,
  },
  sectionEditorHeader: {
    gap: meridian.spacing.xs,
  },
  sectionScopeLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  regenerationPanel: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
  },
  regenerationPanelTitle: {
    ...typography.label,
    color: meridian.color.text,
  },
  regenerationCopy: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  regenerationRecapInput: {
    minHeight: 104,
    textAlignVertical: "top",
  },
  regenerationGuidance: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  summaryInput: {
    minHeight: 132,
    textAlignVertical: "top",
  },
  summaryStatus: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  summaryReplacementPanel: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
  },
  summaryReplacementTitle: {
    ...typography.label,
    color: meridian.color.text,
  },
  summaryReplacementCopy: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  feedbackBar: {
    gap: meridian.spacing.sm,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
});
