import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { PriorSessionDetailResponse } from "../../../../shared/contracts/sessions";

type PriorSessionPanelProps = {
  session: PriorSessionDetailResponse;
};

import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { MeridianCard, MeridianStatusPill, StatusPillType } from "../../ui/meridian/primitives";


function renderValue(value: string | null): string {
  return value && value.trim().length > 0 ? value : "Not available";
}

function formatDisplayDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function PriorSessionPanel({
  session,
}: PriorSessionPanelProps): React.JSX.Element {
  return (
    <MeridianCard>
      <View style={styles.row}>
        <Field label="Session date" value={formatDisplayDate(session.sessionDate)} />
        <View style={styles.field}>
          <Text style={styles.label}>Note status</Text>
          <View style={styles.statusPillContainer}>
            <MeridianStatusPill 
              status={session.noteStatus as StatusPillType} 
              label={session.noteStatus} 
            />
          </View>
        </View>
      </View>
      <Field label="Visit type" value={session.visitType} />
      <Field label="Final note" value={renderValue(session.finalNote)} />
      <Field label="Patient summary" value={renderValue(session.patientSummary)} />
      <Field label="Prior plan" value={renderValue(session.priorPlan)} />
      <Field
        label="Carry-forward context"
        value={renderValue(session.carryForwardContext)}
      />
    </MeridianCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: meridian.spacing.sm,
  },
  statusPillContainer: {
    alignItems: "flex-start",
  },
  field: {
    flex: 1,
    gap: meridian.spacing.xs,
    backgroundColor: meridian.color.surfaceMuted,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.sm,
  },
  label: {
    ...typography.label,
    color: meridian.color.textSubtle,
    textTransform: "uppercase",
  },
  value: {
    ...typography.body,
    fontWeight: "600",
    color: meridian.color.text,
  },
});
