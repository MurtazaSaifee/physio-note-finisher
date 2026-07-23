import React from "react";
import { useFonts } from "expo-font";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope";
import {
  PublicSans_400Regular,
  PublicSans_600SemiBold,
} from "@expo-google-fonts/public-sans";

interface MeridianProviderProps {
  children: React.ReactNode;
}

export function MeridianProvider({
  children,
}: MeridianProviderProps): React.JSX.Element {
  const [, fontError] = useFonts({
    Manrope_600SemiBold,
    PublicSans_400Regular,
    PublicSans_600SemiBold,
  });

  React.useEffect(() => {
    if (fontError) {
      // Let the app render with fallback fonts instead of blanking the UI.
      console.warn("[MeridianProvider] Font loading failed; using fallback fonts.");
    }
  }, [fontError]);

  return <>{children}</>;
}
