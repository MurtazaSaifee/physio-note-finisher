import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.TZ = "Asia/Kolkata";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  Pressable: "Pressable",
  TouchableOpacity: "TouchableOpacity",
  ScrollView: "ScrollView",
  RefreshControl: "RefreshControl",
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  default: "DateTimePicker",
}));

vi.mock("lucide-react-native", () => ({
  CalendarDays: "CalendarDays",
  ChevronLeft: "ChevronLeft",
  ChevronRight: "ChevronRight",
  Plus: "Plus",
}));

const appointmentHookState = vi.hoisted(() => ({
  dayQuery: {
    data: {
      items: [] as Array<Record<string, unknown>>,
    },
    isLoading: false,
    isRefetching: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("../../features/appointments/hooks/useAppointments.js", () => ({
  useAppointmentDay: vi.fn(() => appointmentHookState.dayQuery),
}));

import { CalendarScreen } from "../../features/appointments/screens/CalendarScreen";
import { useAppointmentDay } from "../../features/appointments/hooks/useAppointments";

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt-1",
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Ada Lovelace",
    scheduledAt: "2026-04-30T10:00:00.000Z",
    durationMinutes: 30,
    status: "upcoming",
    linkedSessionId: null,
    reminderText: "",
    notes: null,
    syncStatus: "manual",
    syncedAt: null,
    googleEventId: null,
    createdAt: "2026-04-29T10:00:00.000Z",
    updatedAt: "2026-04-29T10:00:00.000Z",
    ...overrides,
  };
}

function getTimezoneOffsetString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const sign = offset <= 0 ? "+" : "-";
  const absOffset = Math.abs(offset);
  const hours = Math.floor(absOffset / 60).toString().padStart(2, "0");
  const minutes = (absOffset % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function collectText(
  node:
    | TestRenderer.ReactTestRendererJSON
    | TestRenderer.ReactTestRendererJSON[]
    | null,
): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(collectText).join(" ");

  return (node.children ?? [])
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

function collectInstanceText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : collectInstanceText(child)))
    .join(" ");
}

async function renderCalendar(
  props: Partial<React.ComponentProps<typeof CalendarScreen>> = {},
): Promise<TestRenderer.ReactTestRenderer> {
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(
      <CalendarScreen
        onOpenAppointment={() => undefined}
        onNewAppointment={() => undefined}
        {...props}
      />,
    );
    await Promise.resolve();
  });

  if (!renderer) throw new Error("Calendar did not render");
  return renderer;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-30T09:00:00.000Z"));
  appointmentHookState.dayQuery.data.items = [
    appointment(),
    appointment({
      id: "appt-2",
      patientId: "patient-2",
      patientName: "Grace Hopper",
      scheduledAt: "2026-04-30T14:00:00.000Z",
      durationMinutes: 45,
      status: "completed",
      linkedSessionId: "session-1",
    }),
  ];
  appointmentHookState.dayQuery.isLoading = false;
  appointmentHookState.dayQuery.isError = false;
  appointmentHookState.dayQuery.isRefetching = false;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("calendar screen", () => {
  it("renders a title-only agenda header and removes the obsolete calendar controls", async () => {
    const renderer = await renderCalendar();
    const text = collectText(renderer.toJSON());

    expect(text).toContain("Calendar");
    expect(text).toContain("Thu, Apr 30");
    expect(text).toContain("2 visits");
    expect(text).not.toContain("Clinical Calendar");
    expect(text).not.toContain("Weekly agenda");
    expect(text).not.toContain("Care schedule");
    expect(text).not.toContain("Swipe to see more days.");
    expect(text).not.toContain("Start session");
    expect(() => renderer.root.findByProps({ testID: "calendar-date-0-button" })).toThrow();
    expect(() => renderer.root.findByProps({ testID: "calendar-new-appointment-button" })).toThrow();
    expect(() => renderer.root.findByProps({ testID: "calendar-today-button" })).toThrow();
    expect(renderer.root.findByType("ScrollView").props.refreshControl.props.testID).toBe(
      "calendar-refresh-control",
    );

    expect(renderer.root.findByProps({ testID: "calendar-selected-date-button" }).props)
      .toMatchObject({
        accessibilityRole: "button",
        accessibilityState: { selected: true },
      });
    expect(
      renderer.root.findAllByProps({ accessibilityRole: "header" }).map((node) => node.props.children),
    ).toEqual(expect.arrayContaining(["Calendar", "Thu, Apr 30"]));
  });

  it("navigates days, opens the native date picker, and selects the picked local date", async () => {
    const renderer = await renderCalendar();

    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-previous-day-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(useAppointmentDay).toHaveBeenLastCalledWith(
      "2026-04-29",
      getTimezoneOffsetString(new Date("2026-04-29T09:00:00.000Z")),
      expect.objectContaining({ enabled: true }),
    );
    expect(renderer.root.findByProps({ testID: "calendar-today-button" })).toBeTruthy();

    const todayButton = renderer.root.findByProps({ testID: "calendar-today-button" });
    expect(collectInstanceText(todayButton)).toBe("Go to today");
    expect(todayButton.props).toMatchObject({
      accessibilityRole: "button",
      accessibilityLabel: "Return to today",
    });
    expect(todayButton.props.style({ pressed: false })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minHeight: 48,
          backgroundColor: "transparent",
        }),
      ]),
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-selected-date-button" }).props.onPress();
      await Promise.resolve();
    });

    const picker = renderer.root.findByType("DateTimePicker");
    expect(picker.props.testID).toBe("calendar-date-picker");
    expect(picker.props.accessibilityRole).toBeUndefined();
    expect(picker.props.accessibilityLabel).toBeUndefined();

    await act(async () => {
      picker.props.onChange({ type: "set" }, new Date(2026, 4, 2));
      await Promise.resolve();
    });

    expect(useAppointmentDay).toHaveBeenLastCalledWith(
      "2026-05-02",
      getTimezoneOffsetString(new Date(2026, 4, 2)),
      expect.objectContaining({ enabled: true }),
    );
    expect(() => renderer.root.findByType("DateTimePicker")).toThrow();
    expect(collectInstanceText(renderer.root.findByProps({ testID: "calendar-today-button" }))).toBe(
      "Go to today",
    );

    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-today-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(useAppointmentDay).toHaveBeenLastCalledWith(
      "2026-04-30",
      getTimezoneOffsetString(new Date("2026-04-30T09:00:00.000Z")),
      expect.objectContaining({ enabled: true }),
    );
    expect(() => renderer.root.findByProps({ testID: "calendar-today-button" })).toThrow();
  });

  it("shows the earliest future upcoming visit once on today and keeps every visit on other dates", async () => {
    appointmentHookState.dayQuery.data.items = [
      appointment({
        id: "past-upcoming",
        patientName: "Past Visit",
        scheduledAt: "2026-04-30T08:00:00.000Z",
      }),
      appointment({
        id: "later-upcoming",
        patientName: "Later Visit",
        scheduledAt: "2026-04-30T12:00:00.000Z",
      }),
      appointment({
        id: "next-upcoming",
        patientName: "Next Visit",
        scheduledAt: "2026-04-30T10:30:00.000Z",
      }),
    ];
    const onOpenAppointment = vi.fn();
    const renderer = await renderCalendar({ onOpenAppointment });
    const nextVisit = renderer.root.findByProps({ testID: "calendar-next-visit-button" });

    expect(collectInstanceText(nextVisit)).toContain("Next visit");
    expect(collectInstanceText(nextVisit)).toContain("Next Visit");
    expect(collectText(renderer.toJSON()).match(/Next Visit/g)).toHaveLength(1);
    expect(
      renderer.root
        .findAll((node) => /^calendar-appointment-\d+-button$/.test(node.props.testID ?? ""))
        .map((node) => node.props.accessibilityLabel),
    ).toEqual([
      "Open appointment for Past Visit at 13:30",
      "Open appointment for Later Visit at 17:30",
    ]);
    expect(collectText(renderer.toJSON())).toContain("3 visits");

    await act(async () => {
      nextVisit.props.onPress();
      await Promise.resolve();
    });

    expect(onOpenAppointment).toHaveBeenCalledWith("next-upcoming");

    await act(async () => {
      renderer.root.findByProps({ testID: "calendar-next-day-button" }).props.onPress();
      await Promise.resolve();
    });

    expect(() => renderer.root.findByProps({ testID: "calendar-next-visit-button" })).toThrow();
    expect(
      renderer.root.findAll((node) => /^calendar-appointment-\d+-button$/.test(node.props.testID ?? "")),
    ).toHaveLength(3);
  });

  it("keeps loading, error, and empty states distinct without false visit counts", async () => {
    appointmentHookState.dayQuery.isLoading = true;
    appointmentHookState.dayQuery.data.items = [];
    const loadingRenderer = await renderCalendar();
    const loadingText = collectText(loadingRenderer.toJSON());

    expect(loadingRenderer.root.findByProps({ testID: "calendar-loading-state" }).props)
      .toMatchObject({ accessibilityRole: "progressbar" });
    expect(loadingText).not.toContain("0 visits");
    expect(loadingText).not.toContain("No visits scheduled");

    appointmentHookState.dayQuery.isLoading = false;
    appointmentHookState.dayQuery.isError = true;
    const errorRenderer = await renderCalendar();
    const errorText = collectText(errorRenderer.toJSON());
    expect(errorText).toContain("Calendar unavailable");
    expect(errorText).not.toContain("0 visits");
    expect(errorText).not.toContain("No visits scheduled");

    await act(async () => {
      errorRenderer.root.findByProps({ testID: "calendar-retry-button" }).props.onPress();
      await Promise.resolve();
    });
    expect(appointmentHookState.dayQuery.refetch).toHaveBeenCalled();

    appointmentHookState.dayQuery.isError = false;
    const emptyRenderer = await renderCalendar();
    const emptyText = collectText(emptyRenderer.toJSON());
    expect(emptyText).toContain("0 visits");
    expect(emptyText).toContain("No visits scheduled");
    expect(emptyText).toContain("Use + Add to schedule a visit for this day.");
  });

  it("renders flat semantic appointment rows with one button per appointment", async () => {
    appointmentHookState.dayQuery.data.items = [
      appointment({ id: "upcoming", status: "upcoming", scheduledAt: "2026-04-30T08:00:00.000Z" }),
      appointment({ id: "completed", status: "completed" }),
      appointment({ id: "missed", status: "missed" }),
      appointment({ id: "cancelled", status: "cancelled" }),
    ];
    const onOpenAppointment = vi.fn();
    const renderer = await renderCalendar({ onOpenAppointment });

    const rows = [0, 1, 2, 3].map((index) =>
      renderer.root.findByProps({ testID: `calendar-appointment-${index}-button` }),
    );
    expect(rows.map((row) => row.props.accessibilityRole)).toEqual([
      "button",
      "button",
      "button",
      "button",
    ]);
    expect(rows.every((row) => row.findAllByType("Pressable").length === 1)).toBe(true);
    expect(rows[0]?.findByProps({ testID: "calendar-appointment-0-status" }).props.style)
      .toEqual(expect.arrayContaining([expect.objectContaining({ color: "#3F527A" })]));
    expect(rows[1]?.findByProps({ testID: "calendar-appointment-1-status" }).props.style)
      .toEqual(expect.arrayContaining([expect.objectContaining({ color: "#2F6B55" })]));
    expect(rows[2]?.findByProps({ testID: "calendar-appointment-2-status" }).props.style)
      .toEqual(expect.arrayContaining([expect.objectContaining({ color: "#806320" })]));
    expect(rows[3]?.findByProps({ testID: "calendar-appointment-3-status" }).props.style)
      .toEqual(expect.arrayContaining([expect.objectContaining({ color: "#657080" })]));

    await act(async () => {
      rows[2]?.props.onPress();
      await Promise.resolve();
    });
    expect(onOpenAppointment).toHaveBeenCalledWith("missed");
  });

  it("opens the new appointment flow from the floating add button", async () => {
    const onNewAppointment = vi.fn();
    const renderer = await renderCalendar({ onNewAppointment });
    const addButton = renderer.root.findByProps({ testID: "calendar-add-appointment-button" });

    expect(addButton.props).toMatchObject({
      accessibilityRole: "button",
      accessibilityLabel: "Add appointment",
    });

    await act(async () => {
      addButton.props.onPress();
      await Promise.resolve();
    });

    expect(onNewAppointment).toHaveBeenCalledTimes(1);
  });
});
