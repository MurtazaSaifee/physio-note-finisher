import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChevronRight, Plus, SlidersHorizontal, X } from "lucide-react-native";

import type { PatientListItem } from "../../../../shared/contracts/patients";
import { useDebouncedValue } from "../../search/useDebouncedValue";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import {
  MeridianButton,
  MeridianChip,
  MeridianEmptyState,
  MeridianInput,
  MeridianStatusPill,
} from "../../ui/meridian/primitives";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { usePatientList } from "../hooks/usePatients";

type PatientListScreenProps = {
  onOpenPatient: (patientId: string) => void;
  onAddPatient: () => void;
  isActive?: boolean;
};

type WorkItem = {
  item: PatientListItem;
  label: string;
  detail: string;
};

const alphaOptions = ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }

  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLastVisit(value: string | null): string {
  return formatDate(value) ?? "No recent visit";
}

function formatNextAppointment(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function patientDisambiguator(item: PatientListItem): string | null {
  const dateOfBirth = formatDate(item.dateOfBirth);
  if (dateOfBirth) {
    return `Born ${dateOfBirth}`;
  }

  const digits = item.phone?.replace(/\D/g, "") ?? "";
  if (digits.length >= 4) {
    return `Phone ending ${digits.slice(-4)}`;
  }

  return null;
}

function dateValue(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function getWorkItems(items: PatientListItem[], now: number): WorkItem[] {
  const activeItems = items.filter((item) => !item.archivedAt);
  const latestUnfinished = activeItems
    .filter((item) => item.unfinishedNoteCount > 0)
    .sort((left, right) => dateValue(right.updatedAt) - dateValue(left.updatedAt))[0];

  const workItems: WorkItem[] = latestUnfinished
    ? [{
      item: latestUnfinished,
      label: latestUnfinished.unfinishedNoteCount === 1 ? "Unfinished note" : "Unfinished notes",
      detail: `${latestUnfinished.unfinishedNoteCount} note${latestUnfinished.unfinishedNoteCount === 1 ? "" : "s"} still ${latestUnfinished.unfinishedNoteCount === 1 ? "needs" : "need"} attention`,
    }]
    : [];
  const nextAppointment = activeItems
    .filter((item) => item.id !== latestUnfinished?.id)
    .filter((item) => {
      const start = item.nextAppointment ? new Date(item.nextAppointment).getTime() : Number.NaN;
      return !Number.isNaN(start) && start >= now;
    })
    .sort((left, right) => dateValue(left.nextAppointment) - dateValue(right.nextAppointment))[0];

  if (nextAppointment?.nextAppointment) {
    workItems.push({
      item: nextAppointment,
      label: "Next appointment",
      detail: formatNextAppointment(nextAppointment.nextAppointment),
    });
  }

  return workItems;
}

function PatientRow({
  item,
  onOpenPatient,
  index,
}: {
  item: PatientListItem;
  onOpenPatient: (patientId: string) => void;
  index: number;
}): React.JSX.Element {
  const disambiguator = patientDisambiguator(item);
  const status = item.archivedAt
    ? { status: "archived" as const, label: "Archived" }
    : item.unfinishedNoteCount > 0
      ? { status: "draft" as const, label: "Unfinished note" }
      : item.recentSessionStatus
        ? { status: item.recentSessionStatus, label: undefined }
        : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open patient record for ${item.fullName}${disambiguator ? `, ${disambiguator}` : ""}`}
      testID={`patient-list-patient-${index}-card`}
      onPress={() => onOpenPatient(item.id)}
      style={({ pressed }) => [styles.patientRow, pressed && styles.rowPressed]}
    >
      <View style={styles.initialsBadge}>
        <Text style={styles.initialsText}>{getInitials(item.fullName)}</Text>
      </View>
      <View style={styles.patientCopy}>
        <View style={styles.patientTitleRow}>
          <Text style={styles.patientName}>{item.fullName}</Text>
          {status ? (
            <MeridianStatusPill
              status={status.status}
              {...(status.label ? { label: status.label } : {})}
            />
          ) : null}
        </View>
        {disambiguator ? <Text style={styles.metaText}>{disambiguator}</Text> : null}
        <Text style={styles.metaText}>Last visit {formatLastVisit(item.lastVisitDate)}</Text>
      </View>
      <ChevronRight color={meridian.color.textSubtle} size={20} accessibilityElementsHidden />
    </Pressable>
  );
}

export function PatientListScreen({
  onOpenPatient,
  onAddPatient,
  isActive = true,
}: PatientListScreenProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [alpha, setAlpha] = useState("All");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const listQuery = usePatientList({
    query: debouncedQuery,
    includeArchived,
  }, { enabled: isActive });
  const isSearchUpdating = query !== debouncedQuery;

  const filteredItems = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    const search = debouncedQuery.trim().toLowerCase();

    const bySearch = search.length === 0
      ? items
      : items.filter((item) =>
        item.fullName.toLowerCase().includes(search)
        || (item.phone?.toLowerCase() ?? "").includes(search)
        || (item.email?.toLowerCase() ?? "").includes(search),
      );

    return alpha === "All"
      ? bySearch
      : bySearch.filter((item) => item.fullName.toUpperCase().startsWith(alpha));
  }, [alpha, debouncedQuery, listQuery.data?.items]);
  const workItems = useMemo(
    () => getWorkItems(listQuery.data?.items ?? [], Date.now()),
    [listQuery.data?.items],
  );
  const hasActiveFilters = includeArchived || alpha !== "All";
  const countLabel = listQuery.isLoading || listQuery.isError
    ? "— patients"
    : `${filteredItems.length} patient${filteredItems.length === 1 ? "" : "s"}`;

  function clearFilters(): void {
    setIncludeArchived(false);
    setAlpha("All");
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={styles.keyboardRoot}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.screen}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <MeridianScreenHeader
            title="Patients"
            variant="root"
            action={(
              <MeridianButton
                accessibilityLabel="Add patient"
                icon={<Plus color={meridian.color.primary} size={18} accessibilityElementsHidden />}
                label="Add"
                onPress={onAddPatient}
                testID="patient-list-add-patient-button"
                variant="ghost"
              />
            )}
          />

          {workItems.length > 0 ? (
            <View style={styles.todaySection}>
              <Text accessibilityRole="header" style={styles.sectionLabel}>Today</Text>
              {workItems.map((workItem, index) => (
                <Pressable
                  key={workItem.item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${workItem.item.fullName}, ${workItem.label.toLowerCase()}, ${workItem.detail}`}
                  testID={`patient-list-work-item-${index}-card`}
                  onPress={() => onOpenPatient(workItem.item.id)}
                  style={({ pressed }) => [styles.workItem, pressed && styles.rowPressed]}
                >
                  <View style={styles.workItemCopy}>
                    <Text style={styles.workItemLabel}>{workItem.label}</Text>
                    <Text style={styles.workItemName}>{workItem.item.fullName}</Text>
                    <Text style={styles.metaText}>{workItem.detail}</Text>
                  </View>
                  <ChevronRight color={meridian.color.textSubtle} size={20} accessibilityElementsHidden />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.searchSection}>
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <MeridianInput
                  placeholder="Search name, phone, or email"
                  value={query}
                  onChangeText={(value) => {
                    setQuery(value);
                  }}
                  accessibilityLabel="Search patients"
                  accessibilityHint="Search by name, phone, or email"
                  testID="patient-list-search-input"
                />
              </View>
              {query.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear patient search"
                  testID="patient-list-clear-search-button"
                  onPress={() => setQuery("")}
                  style={({ pressed }) => [styles.clearSearchButton, pressed && styles.rowPressed]}
                >
                  <X color={meridian.color.primary} size={18} accessibilityElementsHidden />
                </Pressable>
              ) : null}
            </View>
            {isSearchUpdating ? (
              <Text
                testID="patient-list-search-status"
                accessibilityLiveRegion="polite"
                style={styles.searchStatus}
              >
                Updating patients...
              </Text>
            ) : null}
          </View>

          <View style={styles.directoryHeader}>
            <Text accessibilityRole="header" style={styles.sectionLabel}>Patients</Text>
            <View style={styles.directoryActions}>
              <Text testID="patient-list-count-label" style={styles.countLabel}>{countLabel}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isFilterOpen ? "Hide patient filters" : "Show patient filters"}
                accessibilityState={{ expanded: isFilterOpen }}
                testID="patient-list-filter-button"
                onPress={() => setIsFilterOpen((current) => !current)}
                style={({ pressed }) => [styles.filterButton, pressed && styles.rowPressed]}
              >
                <SlidersHorizontal color={meridian.color.primary} size={17} accessibilityElementsHidden />
                <Text style={styles.filterText}>Filters{hasActiveFilters ? " •" : ""}</Text>
              </Pressable>
            </View>
          </View>

          {isFilterOpen ? (
            <View style={styles.filterPanel} testID="patient-list-filter-panel">
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Include archived charts"
                accessibilityState={{ checked: includeArchived }}
                testID="patient-list-include-archived-chip"
                onPress={() => setIncludeArchived((current) => !current)}
                style={({ pressed }) => [styles.archiveFilterRow, pressed && styles.rowPressed]}
              >
                <Text style={styles.filterPanelText}>Include archived charts</Text>
                <View style={[styles.archiveToggle, includeArchived && styles.archiveToggleOn]}>
                  <View style={[styles.archiveToggleThumb, includeArchived && styles.archiveToggleThumbOn]} />
                </View>
              </Pressable>
              <Text style={styles.filterPanelText}>Browse by letter</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.alphaRow}>
                  {alphaOptions.map((letter) => (
                    <MeridianChip
                      key={letter}
                      label={letter}
                      selected={alpha === letter}
                      onPress={() => setAlpha(letter)}
                      testID={`patient-list-alpha-${letter.toLowerCase()}-chip`}
                    />
                  ))}
                </View>
              </ScrollView>
              {hasActiveFilters ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear patient filters"
                  testID="patient-list-clear-filters-button"
                  onPress={clearFilters}
                  style={({ pressed }) => [styles.clearFiltersButton, pressed && styles.rowPressed]}
                >
                  <Text style={styles.clearFiltersText}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.resultsSection}>
            {listQuery.isLoading ? (
              <Text accessibilityLiveRegion="polite" style={styles.emptyText}>Loading patients...</Text>
            ) : listQuery.isError ? (
              <MeridianEmptyState
                title="We could not load patients"
                message="Check the connection and try again."
                testID="patient-list-error-state"
                action={(
                  <MeridianButton
                    label="Try again"
                    variant="secondary"
                    onPress={() => {
                      void listQuery.refetch();
                    }}
                    testID="patient-list-retry-button"
                  />
                )}
              />
            ) : filteredItems.length ? (
              <View style={styles.results}>
                {filteredItems.map((item, index) => (
                  <PatientRow
                    key={item.id}
                    item={item}
                    index={index}
                    onOpenPatient={onOpenPatient}
                  />
                ))}
              </View>
            ) : (
              <MeridianEmptyState
                title="No patients found"
                message="Try another search or add a new patient."
                testID="patient-list-empty-state"
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  keyboardRoot: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  screen: {
    paddingHorizontal: meridian.spacing.lg,
    paddingTop: meridian.spacing.md,
    paddingBottom: 112,
    gap: meridian.spacing.lg,
    backgroundColor: meridian.color.background,
  },
  todaySection: {
    gap: meridian.spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: meridian.color.text,
  },
  workItem: {
    minHeight: meridian.touchTarget.hit,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
    paddingVertical: meridian.spacing.sm,
    borderBottomColor: meridian.color.border,
    borderBottomWidth: 1,
  },
  workItemCopy: {
    flex: 1,
    gap: 2,
  },
  workItemLabel: {
    ...typography.label,
    color: meridian.color.primary,
  },
  workItemName: {
    ...typography.body,
    color: meridian.color.text,
    fontSize: 16,
    lineHeight: 21,
  },
  searchSection: {
    gap: meridian.spacing.xs,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
  },
  searchInputWrap: {
    flex: 1,
  },
  clearSearchButton: {
    minWidth: meridian.touchTarget.hit,
    minHeight: meridian.touchTarget.hit,
    justifyContent: "center",
    alignItems: "center",
  },
  searchStatus: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  directoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: meridian.spacing.md,
  },
  directoryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
  },
  countLabel: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontWeight: "400",
  },
  filterButton: {
    minHeight: meridian.touchTarget.hit,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: meridian.spacing.sm,
  },
  filterText: {
    ...typography.label,
    color: meridian.color.primary,
  },
  filterPanel: {
    gap: meridian.spacing.sm,
    paddingTop: meridian.spacing.sm,
    borderTopColor: meridian.color.border,
    borderTopWidth: 1,
  },
  archiveFilterRow: {
    minHeight: meridian.touchTarget.hit,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
  },
  filterPanelText: {
    ...typography.label,
    color: meridian.color.text,
  },
  archiveToggle: {
    width: 48,
    height: 28,
    padding: 2,
    borderRadius: 14,
    backgroundColor: meridian.color.surfaceMuted,
    borderWidth: 1,
    borderColor: meridian.color.border,
    justifyContent: "center",
  },
  archiveToggleOn: {
    backgroundColor: meridian.color.primary,
    borderColor: meridian.color.primary,
  },
  archiveToggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: meridian.color.surface,
    alignSelf: "flex-start",
  },
  archiveToggleThumbOn: {
    alignSelf: "flex-end",
  },
  alphaRow: {
    flexDirection: "row",
    gap: meridian.spacing.xs,
    paddingRight: meridian.spacing.md,
  },
  clearFiltersButton: {
    minHeight: meridian.touchTarget.hit,
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  clearFiltersText: {
    ...typography.label,
    color: meridian.color.primary,
  },
  resultsSection: {
    gap: meridian.spacing.sm,
  },
  results: {
    borderTopColor: meridian.color.border,
    borderTopWidth: 1,
  },
  patientRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
    paddingVertical: meridian.spacing.sm,
    borderBottomColor: meridian.color.border,
    borderBottomWidth: 1,
  },
  rowPressed: {
    opacity: 0.72,
  },
  initialsBadge: {
    width: 40,
    height: 40,
    borderRadius: meridian.radius.chip,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: meridian.color.primarySoft,
  },
  initialsText: {
    ...typography.label,
    color: meridian.color.primary,
  },
  patientCopy: {
    flex: 1,
    gap: 2,
  },
  patientTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
  },
  patientName: {
    flex: 1,
    ...typography.body,
    color: meridian.color.text,
    fontSize: 16,
    lineHeight: 21,
  },
  metaText: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontWeight: "400",
  },
  emptyText: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
});
