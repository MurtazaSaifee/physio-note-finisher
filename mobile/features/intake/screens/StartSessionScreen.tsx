import React, { useCallback } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ChevronRight,
  LibraryBig,
  Mic,
} from "lucide-react-native";

import { usePatientProfile } from "../../patients/hooks/usePatients";
import { useConditionTemplates } from "../../notes/hooks/useNotes";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";

type StartSessionScreenProps = {
  patientId?: string;
  onBack: () => void;
  onStartBlank: (patientId: string) => void;
  onStartManual: (patientId: string) => void;
  onUseTemplate: (patientId: string, templateKey: string) => void;
  onOpenTemplateLibrary: (patientId: string) => void;
};

function formatDob(value?: string | null): string {
  if (!value) {
    return "DOB not on file";
  }

  return `DOB: ${new Date(value).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })}`;
}

function TemplateStripCard({
  title,
  description,
  onPress,
  testID,
}: {
  title: string;
  description: string;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.templateCard, pressed && styles.pressed]}
    >
      <View style={styles.templateIcon}>
        <LibraryBig color={meridian.color.primary} size={20} />
      </View>
      <View style={styles.templateCopy}>
        <Text style={styles.templateTitle}>{title}</Text>
        <Text style={styles.templateDescription}>{description}</Text>
      </View>
      <ChevronRight color={meridian.color.textSubtle} size={20} />
    </Pressable>
  );
}

export function StartSessionScreen({
  patientId,
  onBack,
  onStartBlank,
  onStartManual,
  onUseTemplate,
  onOpenTemplateLibrary,
}: StartSessionScreenProps): React.JSX.Element {
  const normalizedPatientId = patientId?.trim() ?? "";
  const profileQuery = usePatientProfile(normalizedPatientId);
  const profile = profileQuery.data;
  const templateQuery = useConditionTemplates({ patientId: normalizedPatientId });
  const templates =
    templateQuery.data?.suggestedTemplates?.length
      ? templateQuery.data.suggestedTemplates
      : templateQuery.data?.recentTemplates?.length
        ? templateQuery.data.recentTemplates
        : templateQuery.data?.templates ?? [];
  const visibleTemplates = templates.slice(0, 4);
  const handleOpenTemplateLibrary = useCallback(
    () => onOpenTemplateLibrary(normalizedPatientId),
    [normalizedPatientId, onOpenTemplateLibrary],
  );
  const handleUseTemplate = useCallback(
    (templateKey: string) => onUseTemplate(normalizedPatientId, templateKey),
    [normalizedPatientId, onUseTemplate],
  );
  const renderTemplateCard = useCallback(
    ({
      item,
      index,
    }: {
      item: (typeof visibleTemplates)[number];
      index: number;
    }) => (
      <TemplateStripCard
        title={item.label}
        description={item.description}
        onPress={() => handleUseTemplate(item.key)}
        testID={`start-session-template-${index}-card`}
      />
    ),
    [handleUseTemplate],
  );
  if (!normalizedPatientId) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.fallbackTitle}>Start New Session</Text>
        <Text style={styles.fallbackText}>Select a patient to continue.</Text>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <MeridianScreenHeader
        title="Start Session"
        subtitle="Choose how you want to begin this visit."
        onBack={onBack}
        backTestID="start-session-back-button"
        variant="task"
      />

      <View style={styles.patientCard}>
        <View style={styles.patientCardAccent} />
        <View style={styles.patientAvatar}>
          <Text style={styles.patientAvatarText}>
            {profile?.fullName?.trim().slice(0, 1).toUpperCase() ?? "A"}
          </Text>
        </View>
        <View style={styles.patientCopy}>
          <Text style={styles.patientEyebrow}>ACTIVE PATIENT</Text>
          <Text style={styles.patientName}>{profile?.fullName ?? "Loading patient..."}</Text>
          <Text style={styles.patientMeta}>{formatDob(profile?.dateOfBirth)}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voice recap"
        testID="start-session-voice-recap-button"
        onPress={() => onStartBlank(normalizedPatientId)}
        style={({ pressed }) => [
          styles.primaryAction,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.primaryIcon}>
          <Mic color={meridian.color.surface} size={28} />
        </View>
        <View style={styles.primaryCopy}>
          <Text style={styles.primaryTitle}>Voice recap</Text>
          <Text style={styles.primaryDescription}>
            Record a focused recap, then review the transcript before building the note.
          </Text>
        </View>
        <ChevronRight color={meridian.color.surface} size={24} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Write manually"
        testID="start-session-write-manually-button"
        onPress={() => onStartManual(normalizedPatientId)}
        style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
      >
        <View style={styles.secondaryCopy}>
          <Text style={styles.secondaryTitle}>Write manually</Text>
          <Text style={styles.secondaryDescription}>
            Start the editable SOAP note without recording audio.
          </Text>
        </View>
        <ChevronRight color={meridian.color.primary} size={24} />
      </Pressable>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Use a Template</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Library"
          testID="start-session-view-library-button"
          onPress={handleOpenTemplateLibrary}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>View Library</Text>
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={visibleTemplates}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.templateStrip}
        renderItem={renderTemplateCard}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: meridian.spacing.lg,
    paddingTop: meridian.spacing.lg,
    paddingBottom: meridian.spacing.xl,
    gap: meridian.spacing.lg,
    backgroundColor: meridian.color.background,
  },
  patientCard: {
    borderRadius: 24,
    backgroundColor: meridian.color.surface,
    padding: meridian.spacing.lg,
    paddingLeft: meridian.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.md,
    ...meridian.shadow.card,
  },
  patientCardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    backgroundColor: meridian.color.primary,
  },
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: meridian.spacing.sm,
  },
  patientAvatarText: {
    ...typography.heading,
    color: meridian.color.text,
  },
  patientCopy: {
    flex: 1,
    gap: 2,
  },
  patientEyebrow: {
    ...typography.label,
    color: meridian.color.textSubtle,
    letterSpacing: 1.4,
  },
  patientName: {
    ...typography.heading,
    color: meridian.color.text,
  },
  patientMeta: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  primaryAction: {
    borderRadius: 24,
    backgroundColor: meridian.color.primary,
    padding: meridian.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.md,
    ...meridian.shadow.card,
  },
  primaryIcon: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCopy: {
    flex: 1,
    gap: meridian.spacing.sm,
  },
  primaryTitle: {
    ...typography.heading,
    color: meridian.color.surface,
  },
  primaryDescription: {
    ...typography.body,
    color: "rgba(255,255,255,0.9)",
  },
  secondaryAction: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: meridian.color.border,
    backgroundColor: meridian.color.surface,
    padding: meridian.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.md,
  },
  secondaryCopy: {
    flex: 1,
    gap: meridian.spacing.sm,
  },
  secondaryTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  secondaryDescription: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: meridian.spacing.md,
  },
  sectionTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  linkText: {
    ...typography.label,
    color: meridian.color.primary,
    fontSize: 16,
  },
  templateStrip: {
    gap: meridian.spacing.sm,
    paddingRight: meridian.spacing.lg,
  },
  templateCard: {
    width: 180,
    borderRadius: meridian.radius.card,
    backgroundColor: meridian.color.surface,
    padding: meridian.spacing.md,
    gap: meridian.spacing.sm,
    ...meridian.shadow.card,
  },
  templateIcon: {
    width: 44,
    height: 44,
    borderRadius: meridian.radius.chip,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  templateCopy: {
    gap: 4,
  },
  templateTitle: {
    ...typography.label,
    color: meridian.color.text,
    fontSize: 16,
  },
  templateDescription: {
    ...typography.body,
    color: meridian.color.textSubtle,
    fontSize: 13,
  },
  fallbackTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  fallbackText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
