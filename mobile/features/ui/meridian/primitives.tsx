import React from "react";
import {
  Pressable,
  TextInput,
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from "react-native";
import { meridian } from "./tokens";
import { typography } from "./typography";

// --- MeridianButton ---
export interface MeridianButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  icon?: React.ReactNode;
}

export function MeridianButton({
  label,
  variant = "primary",
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  icon,
}: MeridianButtonProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        styles.buttonBase,
        styles[`button_${variant}`],
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <View style={styles.buttonContent}>
        {icon}
        <Text
          style={[
            typography.label,
            styles[`buttonText_${variant}`],
            disabled && styles.buttonTextDisabled,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

// --- MeridianCard ---
export interface MeridianCardProps {
  children: React.ReactNode;
  accent?: boolean;
  tonal?: boolean;
}

export function MeridianCard({
  children,
  tonal = false,
}: MeridianCardProps): React.JSX.Element {
  return (
    <View style={[styles.card, tonal && styles.cardTonal]}>
      <View style={styles.cardContent}>{children}</View>
    </View>
  );
}

// --- MeridianInput ---
export interface MeridianInputProps extends TextInputProps {
  // Inherits value, onChangeText, editable, multiline, etc.
}

export function MeridianInput({
  style,
  onFocus,
  onBlur,
  ...props
}: MeridianInputProps): React.JSX.Element {
  const [focused, setFocused] = React.useState(false);

  return (
    <TextInput
      placeholderTextColor={meridian.color.textSubtle}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[styles.input, focused && styles.inputFocused, style]}
      {...props}
    />
  );
}

// --- MeridianChip ---
type MeridianChipBaseProps = {
  label: string;
  selected?: boolean;
};

export type MeridianChipProps = MeridianChipBaseProps & (
  | { onPress: () => void; testID: string }
  | { onPress?: never; testID?: string }
);

export function MeridianChip({
  label,
  selected = false,
  onPress,
  testID,
}: MeridianChipProps): React.JSX.Element {
  const content = (
      <View style={[styles.chipVisible, selected && styles.chipSelected]}>
        <Text style={[typography.label, selected ? styles.chipTextSelected : styles.chipText]}>
          {label}
        </Text>
      </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        testID={testID}
        style={({ pressed }) => [
          styles.chipHitArea,
          pressed && styles.buttonPressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

// --- MeridianStatusPill ---
export type StatusPillType =
  | "neutral"
  | "draft"
  | "saved"
  | "reopened"
  | "finalized"
  | "archived";

export interface MeridianStatusPillProps {
  status: StatusPillType;
  label?: string;
  testID?: string;
}

const STATUS_LABELS: Record<StatusPillType, string> = {
  neutral: "Status",
  draft: "Draft",
  saved: "Saved",
  reopened: "Reopened",
  finalized: "Finalized",
  archived: "Archived",
};

export function MeridianStatusPill({
  status,
  label,
  testID,
}: MeridianStatusPillProps): React.JSX.Element {
  const displayLabel = label && label.toLowerCase() !== status
    ? label
    : STATUS_LABELS[status];

  return (
    <View testID={testID} style={[styles.pillBase, styles[`pill_${status}`]]}>
      <Text style={[typography.label, styles.pillText, styles[`pillText_${status}`]]}>{displayLabel}</Text>
    </View>
  );
}

// --- MeridianRow ---
type MeridianRowBaseProps = {
  title: string;
  subtitle?: string;
  trailingLabel?: string;
  accessibilityLabel?: string;
};

export type MeridianRowProps = MeridianRowBaseProps & (
  | { onPress: () => void; disabled?: boolean; testID: string }
  | { onPress?: never; disabled?: never; testID?: string }
);

export function MeridianRow({
  title,
  subtitle,
  onPress,
  disabled = false,
  trailingLabel,
  accessibilityLabel,
  testID,
}: MeridianRowProps): React.JSX.Element {
  const content = (
    <>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailingLabel ? <Text style={styles.rowTrailing}>{trailingLabel}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={accessibilityLabel || title}
        testID={testID}
        style={({ pressed }) => [
          styles.row,
          pressed && !disabled && styles.rowPressed,
          disabled && styles.rowDisabled,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.row}>{content}</View>;
}

// --- MeridianEmptyState ---
export interface MeridianEmptyStateProps {
  title: string;
  message: string;
  action?: React.ReactNode;
  testID?: string;
}

export function MeridianEmptyState({
  title,
  message,
  action,
  testID,
}: MeridianEmptyStateProps): React.JSX.Element {
  return (
    <View testID={testID} style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

// --- MeridianActionSurface ---
export interface MeridianActionSurfaceProps {
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function MeridianActionSurface({
  title,
  subtitle,
  disabled = false,
  onPress,
  testID,
}: MeridianActionSurfaceProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.actionSurface,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.actionSurfaceDisabled,
      ]}
    >
      <View>
        <Text style={[typography.body, disabled && styles.textDisabled]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[typography.label, { color: meridian.color.textSubtle }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {disabled && (
        <View style={styles.comingSoonBadge}>
          <Text style={[typography.label, { color: meridian.color.textSubtle }]}>
            Coming soon
          </Text>
        </View>
      )}
    </Pressable>
  );
}

type PrimitiveStyles = {
  buttonBase: ViewStyle;
  buttonPressed: ViewStyle;
  buttonDisabled: ViewStyle;
  buttonTextDisabled: TextStyle;
  buttonContent: ViewStyle;
  button_primary: ViewStyle;
  buttonText_primary: TextStyle;
  button_secondary: ViewStyle;
  buttonText_secondary: TextStyle;
  button_ghost: ViewStyle;
  buttonText_ghost: TextStyle;
  button_destructive: ViewStyle;
  buttonText_destructive: TextStyle;
  card: ViewStyle;
  cardTonal: ViewStyle;
  cardContent: ViewStyle;
  input: TextStyle;
  inputFocused: TextStyle;
  chipHitArea: ViewStyle;
  chipVisible: ViewStyle;
  chipSelected: ViewStyle;
  chipText: TextStyle;
  chipTextSelected: TextStyle;
  pillBase: ViewStyle;
  pill_neutral: ViewStyle;
  pill_draft: ViewStyle;
  pill_saved: ViewStyle;
  pill_reopened: ViewStyle;
  pill_finalized: ViewStyle;
  pill_archived: ViewStyle;
  pillText: TextStyle;
  pillText_neutral: TextStyle;
  pillText_draft: TextStyle;
  pillText_saved: TextStyle;
  pillText_reopened: TextStyle;
  pillText_finalized: TextStyle;
  pillText_archived: TextStyle;
  row: ViewStyle;
  rowPressed: ViewStyle;
  rowDisabled: ViewStyle;
  rowCopy: ViewStyle;
  rowTrailing: TextStyle;
  rowTitle: TextStyle;
  rowSubtitle: TextStyle;
  emptyState: ViewStyle;
  emptyTitle: TextStyle;
  emptyMessage: TextStyle;
  emptyAction: ViewStyle;
  actionSurface: ViewStyle;
  actionSurfaceDisabled: ViewStyle;
  textDisabled: TextStyle;
  comingSoonBadge: ViewStyle;
};

// --- Styles ---
const styles = StyleSheet.create<PrimitiveStyles>({
  buttonBase: {
    minHeight: meridian.touchTarget.hit,
    borderRadius: meridian.radius.control,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: meridian.spacing.lg,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    backgroundColor: meridian.color.surfaceMuted,
    borderColor: meridian.color.border,
    borderWidth: 1,
    opacity: 1,
  },
  buttonTextDisabled: {
    color: meridian.color.textSubtle,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  button_primary: {
    backgroundColor: meridian.color.primary,
  },
  buttonText_primary: {
    color: meridian.color.surface,
  },
  button_secondary: {
    backgroundColor: meridian.color.surface,
    borderColor: meridian.color.border,
    borderWidth: 1,
  },
  buttonText_secondary: {
    color: meridian.color.primary,
  },
  button_ghost: {
    backgroundColor: "transparent",
  },
  buttonText_ghost: {
    color: meridian.color.primary,
  },
  button_destructive: {
    backgroundColor: meridian.color.destructive,
  },
  buttonText_destructive: {
    color: meridian.color.surface,
  },
  card: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    flexDirection: "row",
    overflow: "hidden",
    ...meridian.shadow.card,
  },
  cardTonal: {
    backgroundColor: meridian.color.surfaceMuted,
    boxShadow: "none",
  },
  cardContent: {
    flex: 1,
    padding: meridian.spacing.md,
  },
  input: {
    ...typography.body,
    minHeight: meridian.touchTarget.hit,
    borderColor: meridian.color.border,
    borderWidth: 1,
    borderRadius: meridian.radius.control,
    paddingHorizontal: meridian.spacing.md,
    paddingVertical: meridian.spacing.sm,
    color: meridian.color.text,
    backgroundColor: meridian.color.surface,
  },
  inputFocused: {
    borderColor: meridian.color.primary,
    borderWidth: 2,
  },
  chipHitArea: {
    minHeight: meridian.touchTarget.hit,
    minWidth: meridian.touchTarget.hit,
    justifyContent: "center",
    alignItems: "center",
  },
  chipVisible: {
    height: meridian.touchTarget.visible,
    borderRadius: meridian.radius.chip,
    paddingHorizontal: meridian.spacing.md,
    backgroundColor: meridian.color.surfaceMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  chipSelected: {
    backgroundColor: meridian.color.primarySoft,
  },
  chipText: {
    color: meridian.color.text,
  },
  chipTextSelected: {
    color: meridian.color.primary,
  },
  pillBase: {
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
    borderRadius: meridian.radius.chip,
    alignSelf: "flex-start",
  },
  pill_neutral: {
    backgroundColor: meridian.color.surfaceMuted,
  },
  pill_draft: {
    backgroundColor: meridian.color.warningSoft,
  },
  pill_saved: {
    backgroundColor: meridian.color.successSoft,
  },
  pill_reopened: {
    backgroundColor: meridian.color.warningSoft,
  },
  pill_finalized: {
    backgroundColor: meridian.color.successSoft,
  },
  pill_archived: {
    backgroundColor: meridian.color.errorSurface,
  },
  pillText: {
    color: meridian.color.text,
  },
  pillText_neutral: {
    color: meridian.color.textSubtle,
  },
  pillText_draft: {
    color: meridian.color.warning,
  },
  pillText_saved: {
    color: meridian.color.success,
  },
  pillText_reopened: {
    color: meridian.color.warning,
  },
  pillText_finalized: {
    color: meridian.color.success,
  },
  pillText_archived: {
    color: meridian.color.destructive,
  },
  row: {
    minHeight: meridian.touchTarget.hit,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomColor: meridian.color.border,
    borderBottomWidth: 1,
    backgroundColor: "transparent",
    paddingVertical: meridian.spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowCopy: {
    flex: 1,
    gap: meridian.spacing.xs,
  },
  rowTrailing: {
    ...typography.label,
    color: meridian.color.textSubtle,
    marginLeft: meridian.spacing.md,
  },
  rowTitle: {
    ...typography.body,
    color: meridian.color.text,
  },
  rowSubtitle: {
    ...typography.label,
    color: meridian.color.textSubtle,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: meridian.spacing.lg,
  },
  emptyTitle: {
    ...typography.heading,
    color: meridian.color.text,
    textAlign: "center",
  },
  emptyMessage: {
    ...typography.body,
    color: meridian.color.textSubtle,
    textAlign: "center",
    marginTop: meridian.spacing.xs,
  },
  emptyAction: {
    marginTop: meridian.spacing.md,
  },
  actionSurface: {
    backgroundColor: meridian.color.surface,
    borderRadius: meridian.radius.card,
    padding: meridian.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...meridian.shadow.card,
  },
  actionSurfaceDisabled: {
    backgroundColor: meridian.color.surfaceMuted,
    boxShadow: "none",
  },
  textDisabled: {
    color: meridian.color.textSubtle,
  },
  comingSoonBadge: {
    paddingHorizontal: meridian.spacing.sm,
    paddingVertical: meridian.spacing.xs,
    borderRadius: meridian.radius.chip,
    backgroundColor: meridian.color.border,
  },
});
