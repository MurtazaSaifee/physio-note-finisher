import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { MeridianBackButton } from "./BackButton";
import { meridian } from "./tokens";
import { typography } from "./typography";

type MeridianScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backTestID?: string;
  action?: React.ReactNode;
  variant?: "root" | "stack" | "task";
};

export function MeridianScreenHeader({
  title,
  subtitle,
  onBack,
  backTestID,
  action,
  variant = "stack",
}: MeridianScreenHeaderProps): React.JSX.Element {
  const isRoot = variant === "root";
  const isTask = variant === "task";

  return (
    <View style={[styles.container, isTask && styles.containerTask]}>
      <View style={[styles.row, isTask && styles.rowTask]}>
        {onBack ? (
          <MeridianBackButton
            onPress={onBack}
            {...(backTestID ? { testID: backTestID } : {})}
          />
        ) : null}

        <View style={[styles.copy, isTask && styles.copyTask]}>
          <Text
            accessibilityRole="header"
            style={[styles.title, isRoot && styles.titleRoot, isTask && styles.titleTask]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
        </View>

        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
    gap: meridian.spacing.xs,
  },
  containerTask: {
    marginBottom: meridian.spacing.xs,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: meridian.spacing.sm,
  },
  rowTask: {
    alignItems: "flex-start",
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  copyTask: {
    paddingTop: 1,
  },
  title: {
    ...typography.heading,
    color: meridian.color.text,
    fontSize: 22,
    lineHeight: 27,
  },
  titleRoot: {
    fontSize: 20,
    lineHeight: 24,
  },
  titleTask: {
    fontSize: 20,
    lineHeight: 24,
  },
  subtitle: {
    ...typography.body,
    color: meridian.color.textSubtle,
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    marginLeft: meridian.spacing.sm,
  },
});
