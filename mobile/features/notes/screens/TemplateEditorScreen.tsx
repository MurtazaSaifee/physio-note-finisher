import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { TemplateCategory } from "../../../../shared/contracts/notes";
import { MeridianButton, MeridianInput } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { useCreateCustomTemplate, useTemplateCategories, useUpdateCustomTemplate } from "../hooks/useNotes";

type Props = {
  onBack: () => void;
  templateId?: string | undefined;
  initialName?: string | undefined;
  initialCategories?: TemplateCategory[] | undefined;
  initialSections?:
    | { subjective: string; objective: string; assessment: string; plan: string }
    | undefined;
};

const ALL_CATEGORIES: TemplateCategory[] = ["Neurological", "Sports", "Orthopedic", "General"];
const EMPTY_TEMPLATE_CATEGORIES: TemplateCategory[] = [];
const EMPTY_TEMPLATE_SECTIONS = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
} as const;

export function TemplateEditorScreen({
  onBack,
  templateId,
  initialName = "",
  initialCategories = EMPTY_TEMPLATE_CATEGORIES,
  initialSections = EMPTY_TEMPLATE_SECTIONS,
}: Props): React.JSX.Element {
  const [name, setName] = useState(initialName);
  const [categories, setCategories] = useState<TemplateCategory[]>(initialCategories);
  const [subjective, setSubjective] = useState(initialSections.subjective);
  const [objective, setObjective] = useState(initialSections.objective);
  const [assessment, setAssessment] = useState(initialSections.assessment);
  const [plan, setPlan] = useState(initialSections.plan);
  const [newCategory, setNewCategory] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const categoryQuery = useTemplateCategories();
  const createMutation = useCreateCustomTemplate();
  const updateMutation = useUpdateCustomTemplate();
  const availableCategories = useMemo(() => {
    const labels = categoryQuery.data?.map((category) => category.label) ?? [];
    return Array.from(new Set([...ALL_CATEGORIES, ...labels, ...initialCategories, ...categories]));
  }, [categories, categoryQuery.data, initialCategories]);

  const dirty =
    !isDiscarding &&
    (name !== initialName ||
    subjective !== initialSections.subjective ||
    objective !== initialSections.objective ||
    assessment !== initialSections.assessment ||
    plan !== initialSections.plan ||
    [...categories].sort().join("|") !== [...initialCategories].sort().join("|"));

  const hasSectionContent = useMemo(
    () => [subjective, objective, assessment, plan].some((value) => value.trim().length > 0),
    [subjective, objective, assessment, plan],
  );
  const canSave = name.trim().length > 0 && categories.length > 0 && hasSectionContent;

  function toggleCategory(category: TemplateCategory): void {
    setCategories((current) =>
      current.includes(category) ? current.filter((value) => value !== category) : [...current, category],
    );
  }

  function handleAddCategory(): void {
    const label = newCategory.trim();
    if (!label) return;
    setCategories((current) => (current.includes(label) ? current : [...current, label]));
    setNewCategory("");
  }

  async function handleSave(): Promise<void> {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      categories,
      sections: {
        subjective: subjective.trim() || null,
        objective: objective.trim() || null,
        assessment: assessment.trim() || null,
        plan: plan.trim() || null,
      },
    };

    if (templateId) {
      await updateMutation.updateCustomTemplate({ templateId, input: payload });
    } else {
      await createMutation.createCustomTemplate(payload);
    }
    onBack();
  }

  function handleBack(): void {
    if (!dirty) {
      onBack();
      return;
    }
    setShowDiscard(true);
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <MeridianScreenHeader
        title={templateId ? "Edit Template" : "Create Template"}
        subtitle="Manage the template name, categories, and SOAP sections."
        onBack={handleBack}
        backTestID="template-editor-back-button"
        variant="task"
      />

      <MeridianInput testID="template-editor-name-input" placeholder="Template name" value={name} onChangeText={setName} />

      <View style={styles.categoryWrap}>
        {availableCategories.map((category) => (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityLabel={`${category} category`}
            accessibilityHint="Selects or removes this template category."
            accessibilityState={{ selected: categories.includes(category) }}
            testID={`template-editor-category-${category}-button`}
            onPress={() => toggleCategory(category)}
            style={[styles.categoryChip, categories.includes(category) ? styles.categoryChipActive : null]}
          >
            <Text style={styles.categoryText}>{category}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.addCategoryRow}>
        <MeridianInput
          testID="template-editor-new-category-input"
          placeholder="Custom category"
          value={newCategory}
          onChangeText={setNewCategory}
        />
        <MeridianButton
          label="Add"
          variant="secondary"
          testID="template-editor-add-category-button"
          disabled={!newCategory.trim()}
          onPress={handleAddCategory}
        />
      </View>

      <MeridianInput testID="template-editor-subjective-input" placeholder="Subjective" value={subjective} onChangeText={setSubjective} multiline />
      <MeridianInput testID="template-editor-objective-input" placeholder="Objective" value={objective} onChangeText={setObjective} multiline />
      <MeridianInput testID="template-editor-assessment-input" placeholder="Assessment" value={assessment} onChangeText={setAssessment} multiline />
      <MeridianInput testID="template-editor-plan-input" placeholder="Plan" value={plan} onChangeText={setPlan} multiline />

      <MeridianButton
        label={templateId ? "Save" : "Create"}
        testID="template-editor-save-button"
        disabled={!canSave || createMutation.isPending || updateMutation.isPending}
        onPress={handleSave}
      />

      <Modal transparent visible={showDiscard} onRequestClose={() => setShowDiscard(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Discard changes?</Text>
            <Text style={styles.modalBody}>You have unsaved template edits.</Text>
            <View style={styles.modalActions}>
              <MeridianButton label="Keep editing" variant="ghost" onPress={() => setShowDiscard(false)} testID="template-editor-keep-editing-button" />
              <MeridianButton label="Discard" variant="destructive" onPress={onBack} testID="template-editor-discard-button" />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: meridian.spacing.lg, gap: meridian.spacing.md, backgroundColor: meridian.color.background },
  title: { ...typography.heading, color: meridian.color.text },
  categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: meridian.spacing.sm },
  addCategoryRow: { gap: meridian.spacing.sm },
  categoryChip: { paddingHorizontal: meridian.spacing.md, paddingVertical: meridian.spacing.sm, borderRadius: 999, backgroundColor: meridian.color.surface },
  categoryChipActive: { backgroundColor: meridian.color.primarySoft },
  categoryText: { ...typography.label, color: meridian.color.text },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: meridian.spacing.lg },
  modalCard: { width: "100%", borderRadius: 16, backgroundColor: meridian.color.surface, padding: meridian.spacing.lg, gap: meridian.spacing.md },
  modalTitle: { ...typography.heading, color: meridian.color.text },
  modalBody: { ...typography.body, color: meridian.color.textSubtle },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: meridian.spacing.sm },
});
