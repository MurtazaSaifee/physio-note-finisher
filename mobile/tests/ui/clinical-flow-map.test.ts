import { describe, expect, it } from "vitest";

import { clinicalFlowMap } from "../../features/ui/clinicalFlowMap";

const CURRENT_APP_SCREEN_KEYS = [
  "patients",
  "new-patient",
  "patient-profile",
  "start-session",
  "template-library",
  "template-editor",
  "voice-capture",
  "transcript-review",
  "prior-session",
  "note",
  "settings",
  "settings-password",
  "calendar",
  "new-appointment",
  "appointment-detail",
  "export-share",
  "read-only-preview",
  "audit",
] as const;

const CURRENT_AUTH_SCREEN_KEYS = [
  "sign-in",
  "sign-up",
  "verify-email-otp",
  "forgot-password",
] as const;

const EXPECTED_SCREEN_IDS = [
  "app-loading",
  ...CURRENT_AUTH_SCREEN_KEYS,
  ...CURRENT_APP_SCREEN_KEYS,
] as const;

describe("clinical mobile flow map", () => {
  it("covers the current patient-first App shell keys and approved destinations", () => {
    expect(clinicalFlowMap.current.authenticatedDefaultScreen).toBe("patients");
    expect(clinicalFlowMap.current.bottomNavigation.map((item) => item.key)).toEqual([
      "patients",
      "calendar",
      "profile",
    ]);
    expect(clinicalFlowMap.approvedRedesign.defaultScreen).toBe("patients");
    expect(clinicalFlowMap.approvedRedesign.bottomNavigation).toEqual([
      { key: "patients", label: "Patients", target: "patients" },
      { key: "calendar", label: "Calendar", target: "calendar" },
      { key: "profile", label: "Profile", target: "settings" },
    ]);

    expect(clinicalFlowMap.screens.map((screen) => screen.id).sort()).toEqual(
      [...EXPECTED_SCREEN_IDS].sort(),
    );
    expect(clinicalFlowMap.screens.some((screen) => screen.id === "new-patient")).toBe(true);
    expect(
      clinicalFlowMap.transitions.some(
        (transition) =>
          transition.from === "patients" &&
          transition.to === "new-patient" &&
          transition.trigger === "add-patient",
      ),
    ).toBe(true);
    expect(
      clinicalFlowMap.transitions.some(
        (transition) =>
          transition.from === "read-only-preview" &&
          transition.to === "prior-session" &&
          transition.trigger === "create-new-draft-from-session",
      ),
    ).toBe(true);
    expect(
      clinicalFlowMap.transitions.some(
        (transition) =>
          transition.from === "prior-session" &&
          transition.to === "read-only-preview" &&
          transition.trigger === "back-to-finalized-preview",
      ),
    ).toBe(true);
    const settings = clinicalFlowMap.screens.find((screen) => screen.id === "settings");
    const appointment = clinicalFlowMap.screens.find((screen) => screen.id === "appointment-detail");
    const signUp = clinicalFlowMap.screens.find((screen) => screen.id === "sign-up");
    expect(settings?.currentStates.join(" ").toLowerCase()).not.toContain("reminder");
    expect(settings?.currentStates.join(" ").toLowerCase()).not.toContain("google");
    expect(appointment?.currentStates.join(" ").toLowerCase()).not.toContain("reminder");
    expect(signUp?.currentStates).not.toContain("terms-not-accepted");

    expect(
      clinicalFlowMap.transitions.some(
        (transition) =>
          transition.from === "patient-profile" &&
          transition.to === "start-session" &&
          transition.trigger === "start-new-session",
      ),
    ).toBe(true);
    expect(
      clinicalFlowMap.transitions.some(
        (transition) =>
          transition.from === "calendar" &&
          transition.to === "patients" &&
          transition.trigger === "bottom-nav-patients",
      ),
    ).toBe(true);
    expect(
      clinicalFlowMap.transitions.some(
        (transition) =>
          transition.from === "patients" &&
          transition.to === "settings" &&
          transition.trigger === "bottom-nav-profile",
      ),
    ).toBe(true);
    expect(
      clinicalFlowMap.transitions.some(
        (transition) =>
          transition.from === "patients" &&
          transition.to === "patients" &&
          transition.trigger === "hardware-back-native-default",
      ),
    ).toBe(true);
  });

  it("documents contextual appointment and final-review history return targets", () => {
    expect(clinicalFlowMap.transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "new-appointment", to: "patient-profile", trigger: "back" }),
        expect.objectContaining({ from: "new-appointment", to: "patient-profile", trigger: "hardware-back" }),
        expect.objectContaining({ from: "appointment-detail", to: "patient-profile", trigger: "back" }),
        expect.objectContaining({ from: "appointment-detail", to: "patient-profile", trigger: "hardware-back" }),
        expect.objectContaining({ from: "audit", to: "note", trigger: "back" }),
        expect.objectContaining({ from: "audit", to: "note", trigger: "hardware-back" }),
      ]),
    );
  });
});
