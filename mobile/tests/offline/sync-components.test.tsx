import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

import { SyncOverlay } from "../../features/offline/components/SyncOverlay";
import { PendingSyncPill } from "../../features/offline/components/PendingSyncPill";

vi.mock("../../features/ui/meridian/tokens", () => ({
  meridian: {
    color: {
      primary: "#007A8A",
      surface: "#FFFFFF",
      text: "#0F172A",
    },
    spacing: { sm: 8, md: 16, lg: 24, xs: 4 },
    radius: { card: 16, chip: 12 },
  },
}));

vi.mock("../../features/ui/meridian/typography", () => ({
  typography: {
    body: { fontSize: 14, lineHeight: 20 },
    label: { fontSize: 12, fontWeight: "600" },
  },
}));

function collectText(node: TestRenderer.ReactTestRendererJSON | null): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (typeof node === "string") return node;
  const children = node.children ?? [];
  return children.map((child) => (typeof child === "string" ? child : collectText(child))).join("");
}

describe("SyncOverlay", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when status is idle", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(SyncOverlay, {
          syncState: { status: "idle", pendingCount: 0 },
        }),
      );
      await Promise.resolve();
    });

    const json = renderer?.toJSON();
    expect(json).toBeNull();
  });

  it("renders blocking overlay with progress text when syncing", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(SyncOverlay, {
          syncState: { status: "syncing", pendingCount: 2, currentItem: 1, totalItems: 2 },
        }),
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Syncing");
    expect(text).toContain("1 of 2");
  });

  it("shows safe recovery guidance when sync fails without exposing the raw error", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(SyncOverlay, {
          syncState: {
            status: "failed",
            pendingCount: 1,
            lastError: "Network unreachable",
          },
        }),
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("We couldn't sync these changes.");
    expect(text).toContain("They are still saved on this device.");
    expect(text).not.toContain("Network unreachable");
  });
});

describe("PendingSyncPill", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when status is synced", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PendingSyncPill, { syncStatus: "synced" }),
      );
      await Promise.resolve();
    });

    const json = renderer?.toJSON();
    expect(json).toBeNull();
  });

  it("renders amber pending sync pill when status is pending", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PendingSyncPill, { syncStatus: "pending" }),
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Pending sync");
  });

  it("renders a clear recovery state when sync needs attention", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PendingSyncPill, { syncStatus: "failed" }),
      );
      await Promise.resolve();
    });

    const text = collectText(renderer?.toJSON() ?? null);
    expect(text).toContain("Sync needs attention");
  });
});
