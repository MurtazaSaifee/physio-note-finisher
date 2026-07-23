import React, { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ArrowUpRight,
  ChevronRight,
  Plus,
  Search,
  FileText,
  Dumbbell,
  Brain,
  Waypoints,
  HeartPulse,
  Activity,
  Edit2,
} from "lucide-react-native";

import type {
  ConditionTemplate,
  TemplateKey,
  TemplateCategory,
} from "../../../../shared/contracts/notes";
import { useConditionTemplates } from "../../notes/hooks/useNotes";
import { MeridianInput } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";

export type TemplateLibraryScreenProps = {
  patientId: string;
  onBack: () => void;
  onStartBlank: (patientId: string) => void;
  onUseTemplate: (patientId: string, templateKey: TemplateKey) => void;
  onAddTemplate?: () => void | undefined;
  onEditTemplate?: (templateId: string) => void | undefined;
};

const FALLBACK_CATEGORIES: TemplateCategory[] = [
  "Neurological",
  "Sports",
  "Orthopedic",
  "General",
];

function categoryIcon(category: string): React.ReactNode {
  const key = category.toLowerCase();

  if (key.includes("spine") || key.includes("neck") || key.includes("back")) {
    return <Waypoints color={meridian.color.primary} size={20} />;
  }

  if (key.includes("shoulder") || key.includes("elbow") || key.includes("wrist")) {
    return <Dumbbell color={meridian.color.primary} size={20} />;
  }

  if (key.includes("knee") || key.includes("acl")) {
    return <Activity color={meridian.color.primary} size={20} />;
  }

  if (key.includes("balance") || key.includes("gait")) {
    return <HeartPulse color={meridian.color.primary} size={20} />;
  }

  if (key.includes("neuro") || key.includes("stroke") || key.includes("parkinson")) {
    return <Brain color={meridian.color.primary} size={20} />;
  }

  return <FileText color={meridian.color.primary} size={20} />;
}

function formatSectionLabel(section: string): string {
  return section.charAt(0).toUpperCase() + section.slice(1);
}

function TemplateCard({
  template,
  onPress,
  onEdit,
  testID,
}: {
  template: ConditionTemplate;
  onPress: () => void;
  onEdit?: () => void | undefined;
  testID?: string;
}): React.JSX.Element {
  return (
    <View style={styles.templateCardContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={template.label}
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [
          styles.templateCardPressable,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.templateCard}>
          <View style={styles.templateIconWrap}>{categoryIcon(template.category)}</View>
          <View style={styles.templateCopy}>
            <Text style={styles.templateTitle}>{template.label}</Text>
            <Text style={styles.templateCategory}>
              {(template.categories ?? [template.category]).join(", ")}
              {template.source === "custom" ? " • Custom" : ""}
            </Text>
            <Text style={styles.templateDescription}>{template.description}</Text>
          </View>
          <ArrowUpRight color={meridian.color.textSubtle} size={22} />
        </View>
      </Pressable>

      {template.source === "custom" && onEdit && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${template.label}`}
          testID={`${testID}-edit-button`}
          onPress={onEdit}
          style={({ pressed }) => [styles.templateEditButton, pressed && styles.pressed]}
        >
          <Edit2 color={meridian.color.primary} size={18} />
        </Pressable>
      )}
    </View>
  );
}

function CreateTemplateCard({
  onPress,
}: {
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create Template"
      testID="template-library-create-template-button"
      onPress={onPress}
      style={({ pressed }) => [styles.createCardPressable, pressed && styles.pressed]}
    >
      <View style={styles.createCard}>
        <View style={styles.createIconWrap}>
          <Plus color={meridian.color.primary} size={24} />
        </View>
        <View style={styles.createCopy}>
          <Text style={styles.createTitle}>Create Custom Template</Text>
          <Text style={styles.createDescription}>Build a new template for your library</Text>
        </View>
        <ChevronRight color={meridian.color.textSubtle} size={20} />
      </View>
    </Pressable>
  );
}

function BlankSessionCard({
  onPress,
}: {
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start without Template"
      testID="template-library-blank-session-card"
      onPress={onPress}
      style={({ pressed }) => [styles.blankCardPressable, pressed && styles.pressed]}
    >
      <View style={styles.blankCard}>
        <View style={styles.blankIconWrap}>
          <FileText color={meridian.color.surface} size={20} />
        </View>
        <View style={styles.blankCopy}>
          <Text style={styles.blankTitle}>Start without Template</Text>
          <Text style={styles.blankDescription}>Start a new SOAP note from scratch</Text>
        </View>
        <ChevronRight color="rgba(255,255,255,0.75)" size={20} />
      </View>
    </Pressable>
  );
}

function TemplateSection({
  sectionKey,
  title,
  templates,
  onPreview,
  onEdit,
}: {
  sectionKey: string;
  title: string;
  templates: ConditionTemplate[];
  onPreview: (template: ConditionTemplate) => void;
  onEdit?: ((templateId: string) => void) | undefined;
}): React.JSX.Element | null {
  if (!templates.length) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionList}>
        {templates.map((template) => (
          <TemplateCard
            key={`${title}:${template.key}`}
            template={template}
            onPress={() => onPreview(template)}
            {...(onEdit ? { onEdit: () => onEdit(template.key) } : {})}
            testID={`template-library-template-${sectionKey}-${template.key}-card`}
          />
        ))}
      </View>
    </View>
  );
}

export function TemplateLibraryScreen({
  patientId,
  onBack,
  onStartBlank,
  onUseTemplate,
  onAddTemplate,
  onEditTemplate,
}: TemplateLibraryScreenProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<ConditionTemplate | null>(null);

  const templateQuery = useConditionTemplates({
    patientId,
    query,
  });

  const categories = templateQuery.data?.categories?.length
    ? templateQuery.data.categories
    : FALLBACK_CATEGORIES;
  const templates = templateQuery.data?.templates ?? [];
  const groupedTemplates = categories.reduce<Array<{
    category: TemplateCategory;
    templates: ConditionTemplate[];
  }>>((result, category) => {
    const categoryTemplates = templates.filter((template) =>
      (template.categories ?? [template.category]).includes(category),
    );
    if (categoryTemplates.length > 0) {
      result.push({
        category,
        templates: categoryTemplates,
      });
    }
    return result;
  }, []);
  const suggestedTemplates = templateQuery.data?.suggestedTemplates ?? [];
  const recentTemplates = templateQuery.data?.recentTemplates ?? [];
  const librarySections = [
    { key: "suggested", title: "Suggested for this patient", templates: suggestedTemplates },
    { key: "recent", title: "Recent templates", templates: recentTemplates },
    ...groupedTemplates.map((group) => ({
      key: group.category,
      title: group.category,
      templates: group.templates,
    })),
  ];
  const renderLibrarySection = useCallback(
    ({ item }: { item: (typeof librarySections)[number] }) => (
      <TemplateSection
        sectionKey={item.key}
        title={item.title}
        templates={item.templates}
        onPreview={setPreviewTemplate}
        onEdit={onEditTemplate}
      />
    ),
    [onEditTemplate],
  );

  if (previewTemplate) {
    return (
      <View style={styles.previewBackdrop}>
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="always">
          <MeridianScreenHeader
            title={previewTemplate.label}
            subtitle="Preview template sections before using it."
            onBack={() => setPreviewTemplate(null)}
            backTestID="template-library-preview-back-button"
            variant="task"
          />

          <Text style={styles.previewBody}>{previewTemplate.description}</Text>

          <View style={styles.previewSections}>
            {(["subjective", "objective", "assessment", "plan"] as const).map((section) => (
              <View key={section} style={styles.previewBlock}>
                <Text style={styles.previewBlockLabel}>{formatSectionLabel(section)}</Text>
                <Text style={styles.previewBlockText}>
                  {previewTemplate.sections[section] ?? ""}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.previewActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use template"
              testID="template-library-use-template-button"
              onPress={() => onUseTemplate(patientId, previewTemplate.key)}
              style={({ pressed }) => [styles.previewPrimaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.previewPrimaryLabel}>Use template</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <FlatList
      data={librarySections}
      keyExtractor={(item) => item.key}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={styles.screen}
      ListHeaderComponent={
        <>
          <MeridianScreenHeader
            title="Template Library"
            subtitle="Choose a template or start with a blank note."
            onBack={onBack}
            backTestID="template-library-back-button"
            variant="task"
          />

          <View style={styles.searchShell}>
            <Search color={meridian.color.primary} size={22} />
            <MeridianInput
              placeholder="Search templates..."
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              style={styles.searchInput}
              testID="template-library-search-input"
            />
          </View>

          <View style={[styles.section, styles.libraryActionsSection]}>
            <Text style={styles.sectionTitle}>Library Actions</Text>
            <CreateTemplateCard
              onPress={() => (onAddTemplate ? onAddTemplate() : onStartBlank(patientId))}
            />
            <BlankSessionCard onPress={() => onStartBlank(patientId)} />
          </View>
        </>
      }
      renderItem={renderLibrarySection}
    />
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
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
    minHeight: 56,
    paddingHorizontal: meridian.spacing.md,
    backgroundColor: meridian.color.surface,
    borderRadius: 16,
    ...meridian.shadow.card,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "transparent",
    paddingLeft: 0,
    paddingRight: 0,
  },
  searchPlusButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: meridian.color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: meridian.spacing.md,
  },
  libraryActionsSection: {
    marginTop: meridian.spacing.lg,
  },
  sectionTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  createCardPressable: {
    borderRadius: 16,
  },
  createCard: {
    minHeight: 100,
    borderRadius: 16,
    backgroundColor: meridian.color.surface,
    padding: meridian.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.md,
    ...meridian.shadow.card,
  },
  createIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  createCopy: {
    flex: 1,
    gap: 4,
  },
  createTitle: {
    ...typography.label,
    color: meridian.color.text,
    fontSize: 18,
  },
  createDescription: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  blankCardPressable: {
    borderRadius: 16,
  },
  blankCard: {
    minHeight: 100,
    borderRadius: 16,
    backgroundColor: meridian.color.primary,
    padding: meridian.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.md,
    ...meridian.shadow.card,
  },
  blankIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  blankCopy: {
    flex: 1,
    gap: 4,
  },
  blankTitle: {
    ...typography.label,
    color: meridian.color.surface,
    fontSize: 18,
  },
  blankDescription: {
    ...typography.body,
    color: "rgba(255,255,255,0.88)",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionLink: {
    ...typography.label,
    color: meridian.color.primary,
    fontSize: 14,
  },
  sectionList: {
    gap: meridian.spacing.md,
  },
  templateCardPressable: {
    flex: 1,
    borderRadius: 16,
  },
  templateCardContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
  },
  templateEditButton: {
    width: 44,
    height: 128,
    borderRadius: 16,
    backgroundColor: meridian.color.surface,
    borderWidth: 1,
    borderColor: meridian.color.border,
    alignItems: "center",
    justifyContent: "center",
    ...meridian.shadow.card,
  },
  templateCard: {
    minHeight: 128,
    borderRadius: 16,
    backgroundColor: meridian.color.surface,
    padding: meridian.spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: meridian.spacing.md,
    ...meridian.shadow.card,
  },
  templateIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: meridian.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  templateCopy: {
    flex: 1,
    gap: 4,
  },
  templateTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  templateDescription: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  templateCategory: {
    ...typography.label,
    color: meridian.color.primary,
  },
  previewTitle: {
    ...typography.heading,
    color: meridian.color.text,
    fontSize: 24,
  },
  previewBody: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  previewSections: {
    gap: meridian.spacing.md,
  },
  previewBlock: {
    gap: meridian.spacing.sm,
    padding: meridian.spacing.md,
    backgroundColor: meridian.color.surface,
    borderRadius: 16,
    ...meridian.shadow.card,
  },
  previewBlockLabel: {
    ...typography.label,
    color: meridian.color.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  previewBlockText: {
    ...typography.body,
    color: meridian.color.text,
  },
  previewActions: {
    flexDirection: "row",
    gap: meridian.spacing.sm,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: meridian.color.background,
    zIndex: 1,
  },
  previewPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: meridian.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: meridian.color.primary,
    ...meridian.shadow.card,
  },
  previewPrimaryLabel: {
    ...typography.label,
    color: meridian.color.surface,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
