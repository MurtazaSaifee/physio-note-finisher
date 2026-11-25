import { describe, it, expect, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { MeridianProtectedShell, MeridianBottomNav, DESTINATIONS } from "../../features/ui/meridian/shell";
import { meridian } from "../../features/ui/meridian/tokens";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));
vi.mock("lucide-react-native", () => ({
  ActivitySquare: "ActivitySquare",
  CalendarDays: "CalendarDays",
  UsersRound: "UsersRound",
  CircleUserRound: "CircleUserRound",
}));

async function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await Promise.resolve();
  });
  if (!renderer) throw new Error("Failed to render");
  return renderer;
}

function collectText(node: any): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  const children = node.children ?? [];
  return [
    typeof node === "string" ? node : "",
    ...children.map((child: any) => typeof child === "string" ? child : collectText(child)),
  ].filter(Boolean).join(" ");
}

describe("Meridian Shell", () => {
  it("bottom nav renders only the approved patient-first destinations", async () => {
    const renderer = await render(
      <MeridianBottomNav currentDestination="patients" onNavigate={vi.fn()} />
    );
    const text = collectText(renderer.toJSON());
    expect(text).toContain("Calendar");
    expect(text).toContain("Patients");
    expect(text).toContain("Profile");
    expect(text).not.toContain("Sessions");
    expect(text).not.toContain("Notes/Files");
    expect(text).not.toContain("AI Assist");
  });

  it("uses a compact, quiet dock treatment", async () => {
    const renderer = await render(
      <MeridianBottomNav currentDestination="patients" onNavigate={vi.fn()} />,
    );
    const dock = renderer.root.findAllByType("View")[0];
    const dockStyle = Object.assign({}, ...(dock.props.style as Record<string, unknown>[]));

    expect(dockStyle).toMatchObject({
      backgroundColor: meridian.color.background,
      borderTopColor: meridian.color.border,
      borderTopWidth: 1,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    });
    expect(dock.props.style.boxShadow).toBeUndefined();
  });

  it("Patients is working and selected by default", async () => {
    const renderer = await render(
      <MeridianBottomNav currentDestination="patients" onNavigate={vi.fn()} />
    );
    const buttons = renderer.root.findAllByProps({ accessibilityRole: "button" });
    const patientsBtn = buttons.find(b => collectText(b).includes("Patients"));
    expect(patientsBtn?.props.accessibilityState.selected).toBe(true);
    expect(patientsBtn?.props.disabled).toBe(false);
    expect(patientsBtn?.props.focusable).toBe(true);
    expect(DESTINATIONS.map((destination) => destination.key)).toEqual([
      "patients",
      "calendar",
      "profile",
    ]);
  });

  it("Calendar is a working destination", async () => {
    const onNav = vi.fn();
    const navRenderer = await render(
      <MeridianBottomNav currentDestination="patients" onNavigate={onNav} />
    );
    const navButtons = navRenderer.root.findAllByProps({ accessibilityRole: "button" });
    const calendarBtn = navButtons.find(b => collectText(b).includes("Calendar"));

    expect(calendarBtn?.props.accessibilityState.disabled).toBe(false);

    act(() => { calendarBtn?.props.onPress(); });
    expect(onNav).toHaveBeenCalledWith("calendar");

    const shellRenderer = await render(
      <MeridianProtectedShell currentDestination="calendar" onNavigate={vi.fn()} title="Test">
        <Text>Calendar Content</Text>
      </MeridianProtectedShell>
    );
    const text = collectText(shellRenderer.toJSON());
    expect(text).toContain("Calendar Content");
    expect(text).not.toContain("Coming soon");
  });

  it("Profile is a working destination for Clinical Settings", async () => {
    const onNav = vi.fn();
    const navRenderer = await render(
      <MeridianBottomNav currentDestination="patients" onNavigate={onNav} />
    );
    const navButtons = navRenderer.root.findAllByProps({ accessibilityRole: "button" });
    const profileBtn = navButtons.find(b => collectText(b).includes("Profile"));

    expect(profileBtn?.props.accessibilityState.disabled).toBe(false);

    act(() => { profileBtn?.props.onPress(); });
    expect(onNav).toHaveBeenCalledWith("profile");

    const shellRenderer = await render(
      <MeridianProtectedShell currentDestination="profile" onNavigate={vi.fn()} title="Test">
        <Text>Clinical Settings</Text>
      </MeridianProtectedShell>
    );
    const text = collectText(shellRenderer.toJSON());
    expect(text).toContain("Clinical Settings");
    expect(text).not.toContain("Coming soon");
  });

  it("hides the real bottom navigation when a task-focused screen is active", async () => {
    const renderer = await render(
      <MeridianProtectedShell
        currentDestination="patients"
        onNavigate={vi.fn()}
        title="SOAP"
        showBottomNav={false}
      >
        <Text>SOAP editor</Text>
      </MeridianProtectedShell>,
    );

    expect(renderer.root.findAllByProps({ testID: "bottom-nav-patients" })).toHaveLength(0);
    expect(collectText(renderer.toJSON())).toContain("SOAP editor");
  });
});
