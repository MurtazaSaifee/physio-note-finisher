/**
 * Minimal react-native type stub for TypeScript checking.
 * Replace with @types/react-native once the full RN/Expo environment is bootstrapped.
 */
declare module "react-native" {
  import type { ReactNode } from "react";

  type NativeSyntheticEvent<T> = T & { nativeEvent: T };

  interface ViewProps {
    children?: ReactNode;
    style?: object;
    testID?: string;
  }

  interface TextProps {
    children?: ReactNode;
    style?: object;
    testID?: string;
  }

  interface TextInputProps {
    autoCapitalize?: "none" | "sentences" | "words" | "characters";
    keyboardType?: string;
    placeholder?: string;
    secureTextEntry?: boolean;
    onBlur?: (event: NativeSyntheticEvent<unknown>) => void;
    onChangeText?: (text: string) => void;
    value?: string;
    style?: object;
    testID?: string;
  }

  interface PressableProps {
    children?: ReactNode;
    onPress?: () => void;
    style?: object;
    testID?: string;
  }

  export function View(props: ViewProps): React.JSX.Element;
  export function Text(props: TextProps): React.JSX.Element;
  export function TextInput(props: TextInputProps): React.JSX.Element;
  export function Pressable(props: PressableProps): React.JSX.Element;
}
