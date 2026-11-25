export const View = "View";
export const Text = "Text";
export const Pressable = "Pressable";
export const TextInput = "TextInput";
export const ScrollView = "ScrollView";
export const ActivityIndicator = "ActivityIndicator";

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
};

export const Platform = {
  OS: "android",
  select: <T,>(options: { android?: T; default?: T }) =>
    options.android ?? options.default,
};

export const NativeModules = {};
