import { TextStyle } from "react-native";

export const typography: Record<string, TextStyle> = {
  display: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 33.6,
    letterSpacing: 0,
  },
  heading: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 24,
    letterSpacing: 0,
  },
  body: {
    fontFamily: "PublicSans_400Regular",
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 24,
    letterSpacing: 0,
  },
  label: {
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19.6,
    letterSpacing: 0,
  },
};
