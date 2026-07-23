import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { DashboardFilters as SharedDashboardFilters } from "../../../../shared/contracts/dashboard";
import { MeridianButton, MeridianCard, MeridianChip, MeridianInput, MeridianStatusPill } from "../../ui/meridian/primitives";
import { MeridianScreenHeader } from "../../ui/meridian/ScreenHeader";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { useDashboard } from "../hooks/useDashboard";
import { useDebouncedValue } from "../../search/useDebouncedValue";
import { useItemSyncStatus } from "../../offline/hooks/useSyncStatus";
import { PendingSyncPill } from "../../offline/components/PendingSyncPill";

type NoteStatus = "draft" | "finalized" | "reopened";

type DashboardScreenProps = {
  onStartNewSession: () => void;
  onOpenSession: (patientId: string, sessionId: string) => void;
  onOpenAppointment?: (appointmentId: string) => void;
  initialFilters?: SharedDashboardFilters;
  isActive?: boolean;
};

const PAGE_SIZE = 10;
const UPCOMING_BODY =
  "Appointment details will appear here when calendar scheduling is available.";
const EMPTY_DASHBOARD_FILTERS: SharedDashboardFilters = {};
const DASHBOARD_SUBTITLE =
  "Your daily workspace for visits, follow-ups, and note finishing.";

function toActionLabel(status: NoteStatus): "Continue Note" | "View Note" {
  return status === "finalized" ? "View Note" : "Continue Note";
}

function formatSessionDate(sessionDate: string): string {
  return new Date(sessionDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSessionBadge(sessionDate: string): string {
  const date = new Date(sessionDate);
  const day = date.toLocaleDateString("en-US", { day: "numeric" });
  const month = date.toLocaleDateString("en-US", { month: "short" });

  return `${day} ${month}`;
}

function formatUpcomingTime(scheduledAt?: string): string {
  if (!scheduledAt) {
    return "";
  }

  return new Date(scheduledAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatSessionMeta(visitType: string | undefined, sessionDate: string): string {
  const sessionLabel = formatSessionDate(sessionDate);
  return visitType ? `${visitType} · ${sessionLabel}` : sessionLabel;
}

function buildPageSummary(page: number, pageSize: number, total: number, count: number): string {
  if (total === 0 || count === 0) {
    return "0 of 0";
  }

  const start = (page - 1) * pageSize + 1;
  const end = start + count - 1;
  return `${start}-${end} of ${total}`;
}

function PendingSyncPillForSession({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const status = useItemSyncStatus(sessionId);
  if (status !== "pending") {
    return null;
  }
  return <PendingSyncPill syncStatus="pending" />;
}

export function DashboardScreen({
  onStartNewSession,
  onOpenSession,
  onOpenAppointment,
  initialFilters = EMPTY_DASHBOARD_FILTERS,
  isActive = true,
}: DashboardScreenProps): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState<SharedDashboardFilters["noteStatus"]>(
    initialFilters.noteStatus ?? "all",
  );
  const [searchQuery, setSearchQuery] = useState(initialFilters.search ?? "");
  const [page, setPage] = useState(initialFilters.page ?? 1);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const queryFilters = useMemo(
    () => ({
      ...initialFilters,
      noteStatus: statusFilter ?? "all",
      search: debouncedSearch,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, initialFilters, page, statusFilter],
  );

  const dashboardQuery = useDashboard(queryFilters, { enabled: isActive });
  const data = dashboardQuery.data;
  const sessions = data?.recentSessions ?? [];
  const currentPage = data?.page ?? page;
  const total = data?.total ?? sessions.length;
  const totalPages = data?.totalPages ?? (total > 0 ? 1 : 0);
  const pageSummary = buildPageSummary(currentPage, PAGE_SIZE, total, sessions.length);

  const upcoming = data?.upcoming;
  const hasRealUpcoming = Boolean(upcoming?.appointmentId);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: SharedDashboardFilters["noteStatus"]) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.heroSection}>
          <MeridianScreenHeader
            title="Clinical Dashboard"
            subtitle={DASHBOARD_SUBTITLE}
            variant="root"
          />

          <View style={styles.heroPanel}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Session workspace</Text>
              <Text style={styles.heroBody}>
                Start a new note quickly, then return here to review the next
                visit and continue unfinished documentation.
              </Text>
            </View>
            <View style={styles.heroButtonWrap}>
              <MeridianButton
                label="Create a new session"
                onPress={onStartNewSession}
                testID="dashboard-create-session-button"
              />
            </View>
          </View>
        </View>

        <MeridianCard tonal>
          <View style={styles.upcoming}>
            <View style={styles.upcomingHeader}>
              <Text style={styles.upcomingLabel}>Upcoming</Text>
              {hasRealUpcoming ? (
                <View style={styles.upcomingPill}>
                  <Text style={styles.upcomingPillText}>{upcoming?.visitType ?? "Visit"}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.upcomingName}>
              {hasRealUpcoming ? upcoming?.patientName : "No upcoming visit"}
            </Text>
            {hasRealUpcoming ? (
              <Text style={styles.upcomingMeta}>
                {formatUpcomingTime(upcoming?.scheduledAt)}
              </Text>
            ) : null}
            <View style={styles.upcomingDetailPanel}>
              <View style={styles.upcomingFootnote}>
                <Text style={styles.upcomingFootnoteTitle}>
                  {hasRealUpcoming
                    ? "Review the upcoming visit"
                    : "Nothing to review yet"}
                </Text>
                <Text style={styles.upcomingFootnoteBody}>
                  {hasRealUpcoming
                    ? "Tap to review the appointment and start the session."
                    : (upcoming?.body ?? UPCOMING_BODY)}
                </Text>
              </View>
              {hasRealUpcoming ? (
                <View style={styles.upcomingActionWrap}>
                  <MeridianButton
                    label="Review"
                    variant="secondary"
                    testID="dashboard-review-upcoming-button"
                    onPress={() => {
                      if (upcoming?.appointmentId) {
                        onOpenAppointment?.(upcoming.appointmentId);
                      }
                    }}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </MeridianCard>

        <MeridianCard tonal>
          <View style={styles.toolsSection}>
            <View style={styles.toolsHeader}>
              <Text style={styles.toolsEyebrow}>Workspace tools</Text>
              <Text style={styles.pastSessionsTitle}>Past Sessions</Text>
            </View>

            <MeridianInput
              placeholder="Search sessions, notes, patients..."
              value={searchQuery}
              onChangeText={handleSearchChange}
              testID="dashboard-search-input"
            />

            <View style={styles.filterRow}>
              <View style={styles.chipRow}>
                <MeridianChip
                  label="All"
                  selected={statusFilter === "all"}
                  onPress={() => handleStatusFilterChange("all")}
                  testID="dashboard-filter-all-chip"
                />
                <MeridianChip
                  label="Draft"
                  selected={statusFilter === "draft"}
                  onPress={() => handleStatusFilterChange("draft")}
                  testID="dashboard-filter-draft-chip"
                />
                <MeridianChip
                  label="Finalized"
                  selected={statusFilter === "finalized"}
                  onPress={() => handleStatusFilterChange("finalized")}
                  testID="dashboard-filter-finalized-chip"
                />
              </View>
            </View>

            <View style={styles.paginationRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous page"
                accessibilityState={{ disabled: currentPage <= 1 }}
                disabled={currentPage <= 1}
                onPress={() => setPage((value) => Math.max(1, value - 1))}
                testID="dashboard-pagination-previous-button"
                style={({ pressed }) => [
                  styles.paginationButton,
                  currentPage <= 1 && styles.paginationButtonDisabled,
                  pressed && currentPage > 1 && styles.pressed,
                ]}
              >
                <Text style={styles.paginationButtonText}>Previous</Text>
              </Pressable>

              <Text style={styles.pageSummary} testID="dashboard-page-summary">
                {pageSummary}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next page"
                accessibilityState={{
                  disabled: totalPages === 0 || currentPage >= totalPages,
                }}
                disabled={totalPages === 0 || currentPage >= totalPages}
                onPress={() =>
                  setPage((value) =>
                    totalPages === 0 ? value : Math.min(totalPages, value + 1),
                  )
                }
                testID="dashboard-pagination-next-button"
                style={({ pressed }) => [
                  styles.paginationButton,
                  (totalPages === 0 || currentPage >= totalPages) &&
                    styles.paginationButtonDisabled,
                  pressed &&
                    totalPages > 0 &&
                    currentPage < totalPages &&
                    styles.pressed,
                ]}
              >
                <Text style={styles.paginationButtonText}>Next</Text>
              </Pressable>
            </View>
          </View>
        </MeridianCard>

        {sessions.length === 0 ? (
          <MeridianCard>
            <View style={styles.emptyState}>
              <Text style={styles.sectionTitle}>
                {searchQuery.trim().length > 0 || statusFilter !== "all"
                  ? "No matching sessions"
                  : "No sessions yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {searchQuery.trim().length > 0 || statusFilter !== "all"
                  ? "Try a different search or filter."
                  : "Start a new session or select a patient to begin a SOAP note."}
              </Text>
            </View>
          </MeridianCard>
        ) : (
          <View style={styles.sessionList}>
            {sessions.map((session, index) => (
              <MeridianCard key={session.sessionId}>
                <View style={styles.sessionCard}>
                  <View style={styles.sessionTopRow}>
                    <View style={styles.sessionDateBadgeWrap}>
                      <Text style={styles.sessionDateBadge}>
                        {formatSessionBadge(session.sessionDate)}
                      </Text>
                    </View>
                    <View style={styles.sessionPills}>
                      <PendingSyncPillForSession sessionId={session.sessionId} />
                      <MeridianStatusPill status={session.noteStatus} label={session.noteStatus} />
                    </View>
                  </View>
                  <View style={styles.sessionHeadingBlock}>
                    <Text style={styles.patientName}>{session.patientName}</Text>
                    <Text style={styles.sessionMeta}>
                      {formatSessionMeta(session.visitType, session.sessionDate)}
                    </Text>
                  </View>
                  <View style={styles.sessionActionWrap}>
                    <MeridianButton
                      label={toActionLabel(session.noteStatus)}
                      variant="secondary"
                      onPress={() => onOpenSession(session.patientId, session.sessionId)}
                      testID={`dashboard-session-${index}-button`}
                    />
                  </View>
                </View>
              </MeridianCard>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: meridian.color.background,
  },
  screen: {
    paddingHorizontal: meridian.spacing.lg,
    paddingTop: meridian.spacing.lg,
    gap: meridian.spacing.md,
    paddingBottom: 188,
  },
  heroSection: {
    gap: 14,
    paddingTop: meridian.spacing.xs,
  },
  heroPanel: {
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: meridian.spacing.md,
    borderWidth: 1,
    borderColor: meridian.color.border,
  },
  heroCopy: {
    gap: meridian.spacing.xs,
  },
  heroEyebrow: {
    ...typography.label,
    color: meridian.color.primary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  heroBody: {
    ...typography.body,
    color: meridian.color.textSubtle,
    textAlign: "center",
    lineHeight: 23,
  },
  heroButtonWrap: {
    width: "100%",
    alignSelf: "center",
  },
  upcoming: {
    gap: 14,
  },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.sm,
  },
  upcomingLabel: {
    ...typography.label,
    color: meridian.color.primary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  upcomingPill: {
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: 6,
    borderRadius: meridian.radius.chip,
    backgroundColor: meridian.color.primarySoft,
  },
  upcomingPillText: {
    ...typography.label,
    color: meridian.color.primary,
  },
  upcomingName: {
    ...typography.heading,
    color: meridian.color.text,
    fontSize: 22,
    lineHeight: 28,
  },
  upcomingMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  upcomingDetailPanel: {
    backgroundColor: meridian.color.surface,
    borderRadius: 20,
    paddingHorizontal: meridian.spacing.md,
    paddingVertical: meridian.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
    borderWidth: 1,
    borderColor: meridian.color.border,
  },
  upcomingFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
  },
  upcomingFootnote: {
    flex: 1,
    gap: 6,
  },
  upcomingFootnoteTitle: {
    ...typography.label,
    color: meridian.color.text,
  },
  upcomingFootnoteBody: {
    ...typography.body,
    color: meridian.color.textSubtle,
    lineHeight: 22,
  },
  upcomingActionWrap: {
    width: 120,
    maxWidth: "100%",
  },
  toolsSection: {
    gap: meridian.spacing.md,
  },
  toolsHeader: {
    gap: 6,
  },
  toolsEyebrow: {
    ...typography.label,
    color: meridian.color.textSubtle,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  filterRow: {
    gap: 10,
  },
  pastSessionsTitle: {
    ...typography.heading,
    color: meridian.color.text,
    fontSize: 19,
    lineHeight: 24,
  },
  chipRow: {
    flexDirection: "row",
    gap: meridian.spacing.sm,
    flexWrap: "wrap",
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.sm,
    paddingTop: 2,
  },
  paginationButton: {
    minWidth: 88,
    paddingHorizontal: meridian.spacing.md,
    paddingVertical: 10,
    borderRadius: meridian.radius.control,
    backgroundColor: meridian.color.surface,
    borderWidth: 1,
    borderColor: meridian.color.border,
    alignItems: "center",
  },
  paginationButtonDisabled: {
    opacity: 0.45,
  },
  paginationButtonText: {
    ...typography.label,
    color: meridian.color.text,
  },
  pageSummary: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  emptyState: {
    gap: 10,
  },
  sectionTitle: {
    ...typography.heading,
    color: meridian.color.text,
  },
  emptyBody: {
    ...typography.body,
    color: meridian.color.textSubtle,
  },
  sessionList: {
    gap: 12,
  },
  sessionCard: {
    gap: 14,
  },
  sessionHeadingBlock: {
    gap: 4,
  },
  sessionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: meridian.spacing.md,
  },
  sessionDateBadgeWrap: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: meridian.color.surfaceMuted,
  },
  sessionDateBadge: {
    ...typography.label,
    color: meridian.color.primary,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  patientName: {
    ...typography.body,
    color: meridian.color.text,
    fontFamily: "PublicSans_400Regular",
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 20,
  },
  sessionPills: {
    alignItems: "center",
    flexDirection: "row",
    gap: meridian.spacing.xs,
  },
  sessionMeta: {
    ...typography.label,
    color: meridian.color.textSubtle,
    fontSize: 13,
  },
  sessionActionWrap: {
    width: 148,
    maxWidth: "100%",
  },
  pressed: {
    opacity: 0.8,
  },
});
