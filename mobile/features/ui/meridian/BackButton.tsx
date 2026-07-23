import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { ChevronLeft } from "lucide-react-native";

import { meridian } from "./tokens";

type MeridianBackButtonProps = {
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
};

export function MeridianBackButton({
  onPress,
  testID,
  accessibilityLabel = "Back",
}: MeridianBackButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <ChevronLeft color={meridian.color.primary} size={24} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 40,
    height: 40,
    borderRadius: meridian.radius.control,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: meridian.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.88,
  },
});
