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
    package: "com.anonymous.physionotefinisher",
  },
} as const;

export default {
  ...expoConfig,
  extra: {
    apiBaseUrl,
  },
};
