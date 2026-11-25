import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Text } from "react-native";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

vi.mock("@expo-google-fonts/manrope", () => ({
  Manrope_600SemiBold: "Manrope_600SemiBold",
}));

vi.mock("@expo-google-fonts/public-sans", () => ({
  PublicSans_400Regular: "PublicSans_400Regular",
  PublicSans_600SemiBold: "PublicSans_600SemiBold",
}));

const useFontsMock = vi.fn();

vi.mock("expo-font", () => ({
  useFonts: (...args: unknown[]) => useFontsMock(...args),
}));

import { MeridianProvider } from "../../features/ui/meridian/MeridianProvider";

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Failed to render");
  return renderer;
}

function collectText(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) {
    return "";
  }

  if (Array.isArray(node)) {
    return node.map(collectText).join(" ");
  }

  const children = node.children ?? [];
  return [
    typeof node === "string" ? node : "",
    ...children.map((child) =>
      typeof child === "string" ? child : collectText(child),
    ),
  ]
    .filter(Boolean)
    .join(" ");
}

describe("MeridianProvider", () => {
  it("renders children while fonts are still loading", async () => {
    useFontsMock.mockReturnValue([false, null]);

    const renderer = await render(
      <MeridianProvider>
        <Text>Child</Text>
      </MeridianProvider>,
    );

    expect(renderer.toJSON()).not.toBeNull();
    expect(collectText(renderer.toJSON())).toContain("Child");
  });
});
