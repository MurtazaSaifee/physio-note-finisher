const APP_VARIANT = process.env.APP_VARIANT ?? process.env.EXPO_PUBLIC_APP_VARIANT ?? "development";
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const expoConfig = {
  name: "Physio Note Finisher",
  slug: "physio-note-finisher",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  plugins: [
    "expo-asset",
    "expo-audio",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        color: "#3F527A",
      },
    ],
    "expo-sharing",
  ],
  android: {
    package: "com.murtazasaifee.physionotefinisher",
  },
} as const;

if (
  APP_VARIANT !== "development" &&
  (!apiBaseUrl || apiBaseUrl.includes("${"))
) {
  throw new Error(
    "EXPO_PUBLIC_API_BASE_URL must be set to a real HTTPS origin for non-development builds.",
  );
}

export default {
  ...expoConfig,
  extra: {
    appVariant: APP_VARIANT,
    apiBaseUrl,
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    },
  },
};
