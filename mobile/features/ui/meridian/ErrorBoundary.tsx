import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { meridian } from "./tokens";
import { typography } from "./typography";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>We could not load this clinical view</Text>
          <Text style={styles.body}>
            Check the connection and try again. If the problem persists, restart the app.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: meridian.spacing.lg,
    backgroundColor: meridian.color.background,
  },
  title: {
    ...typography.heading,
    color: meridian.color.text,
    marginBottom: meridian.spacing.sm,
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: meridian.color.textSubtle,
    textAlign: "center",
  },
});
