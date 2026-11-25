import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../features/patients/screens/PatientListScreen", () => ({
  PatientListScreen: ({
    onAddPatient,
    onOpenPatient,
  }: {
    onAddPatient: () => void;
    onOpenPatient: (patientId: string) => void;
  }) => (
    <>
      <button testID="route-patient-list" onClick={() => onOpenPatient("patient-42")} />
      <button testID="route-add-patient" onClick={onAddPatient} />
    </>
  ),
}));

vi.mock("../../features/patients/screens/CreatePatientScreen", () => ({
  CreatePatientScreen: ({
    onBack,
    onCreated,
  }: {
    onBack: () => void;
    onCreated: (patientId: string) => void;
  }) => (
    <>
      <button testID="route-create-patient" />
      <button testID="route-create-patient-back" onClick={onBack} />
      <button testID="route-create-patient-success" onClick={() => onCreated("patient-new")} />
    </>
  ),
}));

vi.mock("../../features/patients/screens/PatientProfileScreen", () => ({
  PatientProfileScreen: ({ patientId, onBack }: { patientId?: string; onBack?: () => void }) => (
    <button testID="route-patient-profile" patientId={patientId} onClick={onBack} />
  ),
}));

import PatientsIndexRoute from "../../app/(app)/patients";

describe("PatientsIndexRoute", () => {
  it("opens the selected patient record and returns to the directory", () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(<PatientsIndexRoute />);
    });

    act(() => {
      renderer?.root.findByProps({ testID: "route-patient-list" }).props.onClick();
    });

    expect(renderer?.root.findByProps({ testID: "route-patient-profile" }).props.patientId).toBe("patient-42");

    act(() => {
      renderer?.root.findByProps({ testID: "route-patient-profile" }).props.onClick();
    });

    expect(renderer?.root.findByProps({ testID: "route-patient-list" })).toBeTruthy();
  });

  it("opens patient creation separately, supports cancel, and opens the created record", () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(<PatientsIndexRoute />);
    });

    act(() => {
      renderer?.root.findByProps({ testID: "route-add-patient" }).props.onClick();
    });
    expect(renderer?.root.findByProps({ testID: "route-create-patient" })).toBeTruthy();

    act(() => {
      renderer?.root.findByProps({ testID: "route-create-patient-back" }).props.onClick();
    });
    expect(renderer?.root.findByProps({ testID: "route-patient-list" })).toBeTruthy();

    act(() => {
      renderer?.root.findByProps({ testID: "route-add-patient" }).props.onClick();
    });
    act(() => {
      renderer?.root.findByProps({ testID: "route-create-patient-success" }).props.onClick();
    });
    expect(renderer?.root.findByProps({ testID: "route-patient-profile" }).props.patientId).toBe("patient-new");
  });
});
