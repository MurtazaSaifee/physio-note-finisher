import React from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { meridian } from "../../ui/meridian/tokens";
import { typography } from "../../ui/meridian/typography";
import { MeridianInput } from "../../ui/meridian/primitives";

type SoapSectionEditorProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  testID?: string;
};

export function SoapSectionEditor({
  label,
  value,
  onChangeText,
  placeholder,
  disabled = false,
  testID,
}: SoapSectionEditorProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <MeridianInput
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        multiline
        testID={testID}
        style={[styles.input, disabled ? styles.inputDisabled : null]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: meridian.spacing.sm,
  },
  label: {
    ...typography.label,
    color: meridian.color.textSubtle,
    textTransform: "uppercase",
  },
  input: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  inputDisabled: {
    opacity: 0.65,
  },
});
